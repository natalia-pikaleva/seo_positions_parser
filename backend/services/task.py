from database.models import Project, Keyword, Position, TrendEnum
from datetime import datetime
from uuid import UUID
import time
import requests
from services.celery_app import celery_app
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import logging
import base64
import xml.etree.ElementTree as ET
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

load_dotenv()

DB_USER = os.getenv("POSTGRES_USER", "amin")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "my_super_password")
DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = os.getenv("POSTGRES_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "seo_parser_db")

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

API_KEY = os.getenv("API_KEY")
FOLDER_ID = os.getenv("FOLDER_ID")


def region_to_lr_code(region: str) -> int:
    mapping = {
        "Москва": 213,
        "Санкт-Петербург": 2,
        "Новосибирск": 154,
        "Екатеринбург": 159,
    }
    return mapping.get(region, 213)  # по умолчанию Москва


def start_search(keyword, region, page=0):
    region_id = region_to_lr_code(region)
    url = "https://searchapi.api.cloud.yandex.net/v2/web/searchAsync"
    headers = {
        "Authorization": f"Api-Key {API_KEY}",
        "Content-Type": "application/json"
    }
    body = {
        "query": {
            "searchType": "SEARCH_TYPE_RU",
            "queryText": keyword,
            "regionId": region_id
        },
        "folderId": FOLDER_ID,
        "responseFormat": "FORMAT_XML",
        "userAgent": "Mozilla/5.0",
        "page": page  # Добавляем номер страницы
    }
    logger.info(f"Отправляем запрос: {body}")
    resp = requests.post(url, json=body, headers=headers)
    resp.raise_for_status()
    return resp.json()["id"]


def get_result(operation_id, timeout=120, interval=5):
    url = f"https://operation.api.cloud.yandex.net/operations/{operation_id}"
    headers = {"Authorization": f"Api-Key {API_KEY}"}
    waited = 0
    while waited < timeout:
        resp = requests.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        if data.get("done"):
            return data.get("response", {})
        time.sleep(interval)
        waited += interval
    logger.error(f"Таймаут ожидания результата для операции {operation_id}")
    return {}


def parse_response(response, keyword="unknown"):
    raw_data_b64 = response.get("rawData")
    if not raw_data_b64:
        return []
    try:
        raw_data_bytes = base64.b64decode(raw_data_b64)

        # Сохраняем в файл для отладки
        # timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        # filename = f"debug_yandex_search_{keyword}_{timestamp}.xml"
        # with open(filename, "wb") as f:
        #     f.write(raw_data_bytes)
        # logger.info(f"Декодированный XML сохранён в файл: {filename}")

        xml_root = ET.fromstring(raw_data_bytes)
    except Exception as e:
        logger.error(f"Ошибка при парсинге XML из rawData: {e}")
        return []

    results = []
    for doc in xml_root.findall(".//doc"):
        url_elem = doc.find("url")
        if url_elem is not None and url_elem.text:
            results.append(url_elem.text)
    return results


def find_position(domain, keyword, region, max_pages=10):
    domain = domain.lower()
    for page in range(max_pages):
        operation_id = start_search(keyword, region, page=page)
        logger.info(f"Запрос отправлен, operation_id: {operation_id}, страница: {page}")
        response = get_result(operation_id)
        if not response:
            logger.warning(f"Пустой ответ от API для ключевого слова '{keyword}' на странице {page}")
            continue

        urls = parse_response(response, keyword)
        if not urls:
            logger.warning(f"Не удалось получить результаты поиска для ключевого слова '{keyword}' на странице {page}")
            continue

        for idx, url in enumerate(urls, start=1 + page * 10):
            if domain in url.lower():
                logger.info(f"Домен '{domain}' найден на позиции {idx} по ключевому слову '{keyword}'")
                return idx

        # Если домен не найден на этой странице, переходим к следующей
    logger.info(f"Домен '{domain}' не найден в первых {max_pages * 10} результатах по ключевому слову '{keyword}'")
    return None


from typing import List, Tuple


def parse_and_save_position(session, project: Project, keyword: Keyword) -> bool:
    """
    Парсит позицию для одного ключевого слова и сохраняет в базу.
    Возвращает True, если успешно, False — если произошла ошибка или позиция не получена.
    """
    try:
        position = find_position(domain=project.domain,
                                 keyword=keyword.keyword,
                                 region=keyword.region)
        if position is None:
            logger.warning(
                f"Не удалось получить позицию для ключевого слова '{keyword.keyword}' в проекте {project.id}")
            return False

        last_pos = (
            session.query(Position)
            .filter(Position.keyword_id == keyword.id)
            .order_by(Position.checked_at.desc())
            .first()
        )
        previous_position = last_pos.position if last_pos else None

        if position is None or position > 10:
            cost = 0
        elif 1 <= position <= 3:
            cost = keyword.price_top_1_3
        elif 4 <= position <= 5:
            cost = keyword.price_top_4_5
        else:
            cost = keyword.price_top_6_10

        if previous_position is None:
            trend = TrendEnum.stable
        elif position is None:
            trend = TrendEnum.down
        elif position < previous_position:
            trend = TrendEnum.up
        elif position > previous_position:
            trend = TrendEnum.down
        else:
            trend = TrendEnum.stable

        pos_record = Position(
            keyword_id=keyword.id,
            checked_at=datetime.utcnow(),
            position=position,
            previous_position=previous_position,
            cost=cost,
            trend=trend,
        )
        session.add(pos_record)
        session.commit()
        logger.info(f"Обновлена позиция для ключевого слова '{keyword.keyword}' в проекте {project.id}")
        time.sleep(2)  # пауза между запросами к ключевым словам
        return True

    except Exception as e:
        session.rollback()
        logger.error(f"Ошибка при парсинге ключевого слова '{keyword.keyword}' в проекте {project.id}: {e}")
        return False


@celery_app.task
def parse_positions_task():
    if not API_KEY or not FOLDER_ID:
        logger.error("Отсутствует API_KEY или FOLDER_ID. Проверьте настройки окружения.")
        return

    failed_keywords: List[Tuple[UUID, UUID]] = []

    try:
        session = SessionLocal()
        projects = session.execute(
            select(Project).options(selectinload(Project.keywords))
        ).scalars().all()
    except Exception as e:
        logger.error(f"Ошибка при получении проектов: {e}")
        return
    finally:
        session.close()

    for project in projects:
        session = SessionLocal()
        try:
            for keyword in project.keywords:
                success = parse_and_save_position(session, project, keyword)
                if not success:
                    failed_keywords.append((project.id, keyword.id))

            logger.info(f"Парсер успешно завершён для проекта {project.id}")
            time.sleep(10)  # пауза между проектами

        except Exception as e:
            logger.error(f"Ошибка при парсинге проекта {project.id}: {e}")
        finally:
            session.close()

    # Повторный парсинг для неудачных ключевых слов
    if failed_keywords:
        logger.info(f"Запуск повторного парсинга для {len(failed_keywords)} ключевых слов")
        session = SessionLocal()
        try:
            for project_id, keyword_id in failed_keywords:
                project = session.get(Project, project_id)
                keyword = session.get(Keyword, keyword_id)
                if project and keyword:
                    parse_and_save_position(session, project, keyword)
            logger.info("Повторный парсинг завершён")
        except Exception as e:
            logger.error(f"Ошибка при повторном парсинге: {e}")
        finally:
            session.close()

    return "Парсинг завершён"
