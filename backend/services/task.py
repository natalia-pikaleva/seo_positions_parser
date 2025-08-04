from database.models import Project, Keyword, Position, TrendEnum
from datetime import datetime
from uuid import UUID
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
import asyncio
import aiohttp
from typing import List, Tuple

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

RATE_LIMIT = 10  # max 10 запросов в секунду

semaphore = asyncio.Semaphore(RATE_LIMIT)


async def async_post_json(session: aiohttp.ClientSession, url: str, json_data: dict, headers: dict, retries=3,
                          backoff=5):
    for attempt in range(retries):
        try:
            async with semaphore:
                async with session.post(url, json=json_data, headers=headers) as resp:
                    if resp.status == 429:
                        logger.warning(f"429 Too Many Requests на {url}, попытка {attempt + 1} из {retries}")
                        await asyncio.sleep(backoff * (attempt + 1))
                        continue
                    resp.raise_for_status()
                    return await resp.json()
        except aiohttp.ClientError as e:
            logger.error(f"HTTP POST ошибка на {url}: {e}")
        except asyncio.TimeoutError as e:
            logger.error(f"Таймаут POST запроса к {url}: {e}")
        except Exception as e:
            logger.error(f"Неизвестная ошибка POST запроса к {url}: {e}")
    return None


async def async_get_json(session: aiohttp.ClientSession, url: str, headers: dict, retries=3, backoff=5):
    for attempt in range(retries):
        try:
            async with semaphore:
                async with session.get(url, headers=headers) as resp:
                    if resp.status == 429:
                        logger.warning(f"429 Too Many Requests на {url}, попытка {attempt + 1} из {retries}")
                        await asyncio.sleep(backoff * (attempt + 1))
                        continue
                    resp.raise_for_status()
                    return await resp.json()
        except aiohttp.ClientError as e:
            logger.error(f"HTTP GET ошибка на {url}: {e}")
        except asyncio.TimeoutError as e:
            logger.error(f"Таймаут GET запроса к {url}: {e}")
        except Exception as e:
            logger.error(f"Неизвестная ошибка GET запроса к {url}: {e}")
    return None


def region_to_lr_code(region: str) -> int:
    mapping = {
        "Москва": 213,
        "Санкт-Петербург": 2,
        "Новосибирск": 154,
        "Екатеринбург": 159,
    }
    return mapping.get(region, 213)  # по умолчанию Москва


async def start_search_async(session: aiohttp.ClientSession, keyword: str, region: str, page=0) -> str:
    url = "https://searchapi.api.cloud.yandex.net/v2/web/searchAsync"
    headers = {
        "Authorization": f"Api-Key {API_KEY}",
        "Content-Type": "application/json"
    }
    body = {
        "query": {
            "searchType": "SEARCH_TYPE_RU",
            "queryText": keyword,
            "page": page
        },
        "folderId": FOLDER_ID,
        "responseFormat": "FORMAT_XML",
        "userAgent": "Mozilla/5.0",
        "region": region
    }
    logger.info(f"Отправляем запрос: {body}")
    try:
        resp_json = await async_post_json(session, url, body, headers)
        if not resp_json or "id" not in resp_json:
            logger.error(f"Ответ API не содержит 'id': {resp_json}")
            return None
        return resp_json["id"]
    except Exception as e:
        logger.error(f"Ошибка в start_search_async: {e}")
        return None


async def get_result_async(session: aiohttp.ClientSession, operation_id: str, timeout=120, interval=5):
    url = f"https://operation.api.cloud.yandex.net/operations/{operation_id}"
    headers = {"Authorization": f"Api-Key {API_KEY}"}

    waited = 0
    while waited < timeout:
        data = await async_get_json(session, url, headers)
        if not data:
            logger.warning(f"Пустой или некорректный ответ при получении результата операции {operation_id}")
            await asyncio.sleep(interval)
            waited += interval
            continue

        if data.get("done"):
            return data.get("response", {})
        await asyncio.sleep(interval)
        waited += interval

    logger.error(f"Таймаут ожидания результата для операции {operation_id}")
    return {}


def parse_response(response):
    raw_data_b64 = response.get("rawData")
    if not raw_data_b64:
        logger.warning("rawData отсутствует в ответе, парсинг невозможен")
        return []

    try:
        raw_data_bytes = base64.b64decode(raw_data_b64)

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


async def find_position_async(session_http: aiohttp.ClientSession, domain: str, keyword: str, region: str,
                              max_pages=10):
    domain = domain.lower()
    for page in range(max_pages):
        try:
            operation_id = await start_search_async(session_http, keyword, region, page=page)
            if not operation_id:
                logger.warning(f"Не удалось получить operation_id для ключевого слова '{keyword}', страница {page}")
                continue
            logger.info(f"Запрос отправлен, operation_id: {operation_id}, страница: {page}")
            response = await get_result_async(session_http, operation_id)
            if not response:
                logger.warning(f"Пустой ответ от API для ключевого слова '{keyword}' на странице {page}")
                continue

            urls = parse_response(response)
            if not urls:
                logger.warning(
                    f"Не удалось получить результаты поиска для ключевого слова '{keyword}' на странице {page}")
                continue

            for idx, url in enumerate(urls, start=1 + page * 10):
                if domain in url.lower():
                    logger.info(f"Домен '{domain}' найден на позиции {idx} по ключевому слову '{keyword}'")
                    return idx
        except Exception as e:
            logger.error(f"Ошибка при обработке страницы {page} ключевого слова '{keyword}': {e}")

    logger.info(f"Домен '{domain}' не найден в первых {max_pages * 10} результатах по ключевому слову '{keyword}'")
    return None


async def parse_and_save_position_async(session_db, session_http, project: Project, keyword: Keyword) -> bool:
    try:
        position = await find_position_async(session_http, domain=project.domain, keyword=keyword.keyword,
                                             region=keyword.region)
        if position is None:
            logger.warning(
                f"Не удалось получить позицию для ключевого слова '{keyword.keyword}' в проекте {project.id}")
            return False

        last_pos = (
            session_db.query(Position)
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
        session_db.add(pos_record)
        session_db.commit()

        logger.info(f"Обновлена позиция для ключевого слова '{keyword.keyword}' в проекте {project.id}")
        return True
    except Exception as e:
        session_db.rollback()
        logger.error(f"Ошибка при парсинге ключевого слова '{keyword.keyword}' в проекте {project.id}: {e}")
        return False


async def process_single_project_async(session_db, session_http, project: Project) -> List[Tuple[UUID, UUID]]:
    """
    Асинхронная обработка одного проекта:
    - параллельно обрабатывает все ключевые слова с is_check=True,
    - возвращает список (project.id, keyword.id) ключевых слов, для которых произошла ошибка или парсинг не прошёл.
    """
    failed_keywords_local = []
    tasks = []
    keywords_checked = [kw for kw in project.keywords if kw.is_check]

    for keyword in keywords_checked:
        tasks.append(parse_and_save_position_async(session_db, session_http, project, keyword))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    for keyword, result in zip(keywords_checked, results):
        if isinstance(result, Exception):
            logger.error(f"Ошибка при обработке ключевого слова '{keyword.keyword}' в проекте {project.id}: {result}")
            failed_keywords_local.append((project.id, keyword.id))
        elif result is False:  # неудачная обработка, но без исключения
            failed_keywords_local.append((project.id, keyword.id))

    return failed_keywords_local


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

    async def main():
        try:
            async with aiohttp.ClientSession() as session_http:
                for project in projects:
                    session_db = SessionLocal()
                    try:
                        failed_local = await process_single_project_async(session_db, session_http, project)
                        failed_keywords.extend(failed_local)
                    except Exception as e:
                        logger.error(f"Ошибка при асинхронном парсинге проекта {project.id}: {e}")
                    finally:
                        session_db.close()
                    await asyncio.sleep(1)  # пауза между проектами

                if failed_keywords:
                    logger.info(f"Запуск повторного парсинга для {len(failed_keywords)} ключевых слов")
                    async with aiohttp.ClientSession() as session_http_retry:
                        session_db_retry = SessionLocal()
                        try:
                            retry_tasks = []
                            for project_id, keyword_id in failed_keywords:
                                project = session_db_retry.get(Project, project_id)
                                keyword = session_db_retry.get(Keyword, keyword_id)
                                if project and keyword:
                                    retry_tasks.append(
                                        parse_and_save_position_async(session_db_retry, session_http_retry, project,
                                                                      keyword)
                                    )
                            retry_results = await asyncio.gather(*retry_tasks, return_exceptions=True)
                            logger.info("Повторный парсинг завершён")
                        except Exception as e:
                            logger.error(f"Ошибка при повторном парсинге: {e}")
                        finally:
                            session_db_retry.close()
        except Exception as e:
            logger.error(f"Ошибка в основной async функции parse_positions_task: {e}")

    asyncio.run(main())
    return "Парсинг завершён"


@celery_app.task
def parse_positions_by_project_task(project_id: str):
    session = SessionLocal()
    try:
        project = session.get(Project, project_id)
        if not project:
            logger.error(f"Проект {project_id} не найден")
            return
    finally:
        session.close()

    async def process_single_project_async(session_db, session_http, project: Project) -> List[Tuple[UUID, UUID]]:
        """
        Асинхронная обработка одного проекта:
        - параллельно обрабатывает все ключевые слова с is_check=True,
        - возвращает список (project.id, keyword.id) ключевых слов с ошибками.
        """
        failed_keywords_local = []
        tasks = []
        keywords_checked = [kw for kw in project.keywords if kw.is_check]

        for keyword in keywords_checked:
            tasks.append(parse_and_save_position_async(session_db, session_http, project, keyword))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for keyword, result in zip(keywords_checked, results):
            if isinstance(result, Exception):
                logger.error(
                    f"Ошибка при обработке ключевого слова '{keyword.keyword}' в проекте {project.id}: {result}")
                failed_keywords_local.append((project.id, keyword.id))
            elif result is False:
                failed_keywords_local.append((project.id, keyword.id))

        return failed_keywords_local

    async def main(proj: Project):
        failed_keywords: List[Tuple[UUID, UUID]] = []

        async with aiohttp.ClientSession() as session_http:
            session_db = SessionLocal()
            try:
                failed_keywords.extend(await process_single_project_async(session_db, session_http, proj))
            except Exception as e:
                logger.error(f"Ошибка при асинхронном парсинге проекта {proj.id}: {e}")
            finally:
                session_db.close()

            # Повторная обработка неудачных ключевых слов
            if failed_keywords:
                logger.info(f"Запуск повторного парсинга для {len(failed_keywords)} ключевых слов в проекте {proj.id}")
                session_db_retry = SessionLocal()
                try:
                    retry_tasks = []
                    for project_id, keyword_id in failed_keywords:
                        # Для одного проекта project_id всегда одинаковый, можно брать proj
                        keyword = session_db_retry.get(Keyword, keyword_id)
                        if keyword:
                            retry_tasks.append(
                                parse_and_save_position_async(session_db_retry, session_http, proj, keyword)
                            )
                    retry_results = await asyncio.gather(*retry_tasks, return_exceptions=True)
                    # Можно обработать retry_results, если надо
                    logger.info("Повторный парсинг ключевых слов завершён")
                except Exception as e:
                    logger.error(f"Ошибка при повторном парсинге проекта {proj.id}: {e}")
                finally:
                    session_db_retry.close()

    # Запускаем асинхронный цикл
    asyncio.run(main(project))

    logger.info(f"Парсер успешно завершён для проекта {project.id}")
    return "Парсинг завершён"
