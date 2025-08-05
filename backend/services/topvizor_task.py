from database.models import Project, Keyword, Position, TrendEnum
from datetime import datetime
from services.celery_app import celery_app
import os
from dotenv import load_dotenv
from typing import List, Tuple
import logging
import asyncio
import aiohttp
from uuid import UUID

logger = logging.getLogger(__name__)

load_dotenv()

TOPVIZOR_ID = os.getenv("TOPVIZOR_ID", "")
TOPVIZOR_API_KEY = os.getenv("TOPVIZOR_API_KEY", "")


async def get_positions_topvisor(session_http: aiohttp.ClientSession, project_id: int, region_key: int, date: str):
    url = "https://api.topvisor.com/v2/json/get/positions_2/history"
    headers = {
        "User-Id": TOPVIZOR_ID,
        "Authorization": TOPVIZOR_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "project_id": project_id,
        "region_key": region_key,
        "date1": date,
        "date2": date
    }

    async with session_http.post(url, json=payload, headers=headers) as resp:
        if resp.status != 200:
            # Логируем в вызывающей функции, здесь возвращаем None
            return None
        data = await resp.json()

    # Проверка, есть ли "result" и он непустой
    result = data.get("result")
    if result is None:
        return None

    if not result:
        # Пустой список позиций
        return []

    return result


def find_position_from_topvisor_result(result: list, keyword: str, domain: str) -> int:
    domain = domain.lower()
    for item in result:
        # item содержит ключевое слово и позиции (массив под ключом 'positions')
        if item.get("keyword", "").lower() == keyword.lower():
            positions = item.get("positions", [])
            for pos_obj in positions:
                url = pos_obj.get("url", "").lower()
                pos = pos_obj.get("position")
                if domain in url:
                    return pos
            # Если не нашли URL с доменом, возвращаем позицию без URL (или None)
            if positions:
                return positions[0].get("position")
    return None


def region_to_lr_code(region: str) -> int:
    mapping = {
        "Москва": 213,
        "Санкт-Петербург": 2,
        "Новосибирск": 154,
        "Екатеринбург": 159,
    }
    return mapping.get(region, 213)  # по умолчанию Москва


async def fetch_all_positions(session_http: aiohttp.ClientSession, project_id: int, region_key: int, date: str):
    # Получаем все позиции проекта за регион и дату (один запрос)
    return await get_positions_topvisor(session_http, project_id, region_key, date)


def process_single_keyword_position(session_db, position_data: dict, keyword: Keyword, domain: str) -> bool:
    # Находит позицию по ключевому слову в переданных данных position_data (ответ API),
    # сохранит запись в БД, если позиция найдена, и вернет True/False

    position = None
    keyword_text = keyword.keyword.lower()
    domain_lower = domain.lower()

    for item in position_data:
        if item.get("keyword", "").lower() == keyword_text:
            positions = item.get("positions", [])
            for pos_obj in positions:
                url = pos_obj.get("url", "").lower()
                pos = pos_obj.get("position")
                if domain_lower in url:
                    position = pos
                    break
            if position is None and positions:
                position = positions[0].get("position")
            break

    if position is None:
        return False  # позиция не найдена

    last_pos = (
        session_db.query(Position)
        .filter(Position.keyword_id == keyword.id)
        .order_by(Position.checked_at.desc())
        .first()
    )
    previous_position = last_pos.position if last_pos else None

    # Вычисление cost и trend (аналогично вашему коду)
    if position > 10:
        cost = 0
    elif 1 <= position <= 3:
        cost = keyword.price_top_1_3
    elif 4 <= position <= 5:
        cost = keyword.price_top_4_5
    else:
        cost = keyword.price_top_6_10

    if previous_position is None:
        trend = TrendEnum.stable
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

    return True


async def process_all_keywords_together(session_db, session_http, project: Project, semaphore: asyncio.Semaphore):
    date_today = datetime.utcnow().strftime("%Y-%m-%d")
    region_key = region_to_lr_code(project.region)  # или keyword.region, если разный для каждого ключа

    async with semaphore:
        all_positions_data = await fetch_all_positions(session_http, project.id, region_key, date_today)

    if all_positions_data is None or all_positions_data == []:
        logger.warning(f"Нет данных позиций от Topvisor для проекта {project.id}")
        return [(project.id, kw.id) for kw in project.keywords if kw.is_check]

    failed_keywords_local = []

    for kw in project.keywords:
        if not kw.is_check:
            continue
        try:
            success = process_single_keyword_position(session_db, all_positions_data, kw, project.domain)
            if not success:
                failed_keywords_local.append((project.id, kw.id))
        except Exception as e:
            logger.error(f"Ошибка при обработке ключевого слова '{kw.keyword}' в проекте {project.id}: {e}")
            failed_keywords_local.append((project.id, kw.id))

    return failed_keywords_local
