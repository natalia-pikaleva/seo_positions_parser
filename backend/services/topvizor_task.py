from database.models import Project, Keyword, Position, TrendEnum, Group
import json
from services.celery_app import celery_app
import os
import time
from datetime import datetime
from database.db_init import SyncSessionLocal

from dotenv import load_dotenv
from typing import List
import logging
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from services.topvizor_utils import (retry_request,
                                     get_region_key_index_static,
                                     get_keyword_volumes)
from database.models import TaskStatus

logger = logging.getLogger(__name__)

load_dotenv()

TOPVIZOR_ID = os.getenv("TOPVIZOR_ID", "")
TOPVIZOR_API_KEY = os.getenv("TOPVIZOR_API_KEY", "")


def start_topvisor_position_check(topvisor_project_id: int):
    url = "https://api.topvisor.com/v2/json/edit/positions_2/checker/go"
    headers = {
        "User-Id": TOPVIZOR_ID,
        "Authorization": TOPVIZOR_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "filters": [{"name": "id", "operator": "EQUALS", "values": [topvisor_project_id]}]
    }
    logger.info(f"Starting position check for project {topvisor_project_id} with payload: {payload}")
    try:
        data = retry_request(url, payload, headers, max_retries=5, delay=20)
        logger.info(f"Position check response data: {data}")
        return data
    except Exception as e:
        logger.error(f"Exception in start_topvisor_position_check for project {topvisor_project_id}: {e}",
                     exc_info=True)
        return None


def get_positions_topvisor(project_id: int,
                           region_key: int,
                           date_today: datetime,
                           searcher_key: int = 0,
                           max_retries: int = 5,
                           delay: int = 20):
    date = date_today.strftime("%Y-%m-%d")
    url = "https://api.topvisor.com/v2/json/get/positions_2/history"
    headers = {
        "User-Id": TOPVIZOR_ID,
        "Authorization": TOPVIZOR_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "project_id": project_id,
        "regions_indexes": [region_key],
        "searcher_keys": [searcher_key],
        "dates": [date],
        "show_headers": True,
        "show_tops": True
    }
    logger.info(
        f"Запрос в Topvisor: project_id={project_id}, searcher_keys={[searcher_key]}, regions_indexes={[region_key]}, date1={date}")

    try:
        data = retry_request(url, payload, headers, max_retries=max_retries, delay=delay)
        logger.debug(f"Данные от Topvisor (positions): {json.dumps(data, indent=2, ensure_ascii=False)}")
    except Exception as e:
        logger.error(f"Ошибка запроса позиций Topvisor для проекта {project_id}: {e}", exc_info=True)
        return None

    if "errors" in data:
        logger.error(f"Topvisor API ошибки для проекта {project_id}: {data['errors']}")
        return None

    result = data.get("result")
    if not result:
        logger.warning(f"Topvisor API вернул пустой result для проекта {project_id}")
        return None

    keywords = result.get("keywords")
    if keywords is None:
        logger.warning(f"Topvisor API result не содержит keywords для проекта {project_id}")
        return []

    logger.info(f"Topvisor API ответ успешно обработан для проекта {project_id}")
    return keywords


def find_position_from_topvisor_result(result: list, keyword: str, domain: str) -> int:
    domain = domain.lower()
    for item in result:
        # item содержит ключевое слово и позиции (массив под ключом 'positions')
        if item.get("name", "").lower() == keyword.lower():
            positions = item.get("positionsData", [])
            for pos_obj in positions:
                url = pos_obj.get("url", "").lower()
                pos = pos_obj.get("position")
                if domain in url:
                    return pos
            # Если не нашли URL с доменом, возвращаем позицию без URL (или None)
            if positions:
                return positions[0].get("position")
    return None


def process_single_keyword_position(session_db, position_data: list, frequency_map: dict,
                                    keyword: Keyword, domain: str,
                                    project_id: int, region_index: int, date_today: datetime) -> bool:
    try:
        date = date_today.strftime("%Y-%m-%d")
        logger.info(f"Обработка ключевого слова '{keyword.keyword}'")
        position = None
        frequency = None

        keyword_text = keyword.keyword.lower()

        for item in position_data:
            if item.get("name", "").lower() == keyword_text:
                positions_data = item.get("positionsData", {})
                logger.info(f"PositionsData для ключа '{keyword.keyword}': {positions_data}")

                key_for_date = f"{date}:{str(project_id)}:{region_index}"
                logger.info(f"Ищем позицию по ключу: {key_for_date}")
                pos_info = positions_data.get(key_for_date, {})

                pos_value = pos_info.get("position")
                position = None

                if pos_value is not None and pos_value != "--":
                    try:
                        # Очищаем строку от пробелов и лишних символов перед преобразованием
                        pos_value_clean = str(pos_value).strip()
                        position = int(pos_value_clean)
                        logger.info(f"Найдена позиция для ключа '{keyword.keyword}': {position}")
                    except (TypeError, ValueError) as e:
                        logger.warning(
                        f"Некорректное значение позиции для '{keyword.keyword}': {pos_value}, ошибка: {e}")
                else:
                    logger.info(f"Позиция для ключа '{keyword.keyword}' отсутствует или равна '--'")

                frequency = frequency_map.get(keyword_text)
                logger.info(f"Частотность для ключа '{keyword.keyword}': {frequency}")

                break  # нашли ключевое слово, дальше не ищем

        if position is None and (frequency is None or frequency == '-'):
            logger.info(f"Нет позиции и частотности для ключа '{keyword.keyword}', запись не создаётся")
            return False

        stmt = select(Position).filter(Position.keyword_id == keyword.id).order_by(Position.checked_at.desc()).limit(1)
        result = session_db.execute(stmt)
        last_pos = result.scalars().first()
        previous_position = last_pos.position if last_pos else None
        logger.info(f"Прошлая позиция для ключа '{keyword.keyword}': {previous_position}")

        if position is None or position > 10:
            cost = 0
           
        elif 1 <= position <= 3:
            cost = keyword.price_top_1_3
           
        elif 4 <= position <= 5:
            cost = keyword.price_top_4_5
           
        else:
            cost = keyword.price_top_6_10
        logger.info(f"Рассчитанная стоимость для ключа '{keyword.keyword}': {cost}")


        if previous_position is None or position is None:
            trend = TrendEnum.stable
        elif position < previous_position:
            trend = TrendEnum.up
        elif position > previous_position:
            trend = TrendEnum.down
        else:
            trend = TrendEnum.stable
        logger.info(f"Тренд для ключа '{keyword.keyword}': {trend}")

        pos_record = Position(
            keyword_id=keyword.id,
            checked_at=date_today,
            position=position,
            frequency=frequency,
            previous_position=previous_position,
            cost=cost,
            trend=trend,
        )
        session_db.add(pos_record)
        logger.info(
            f"Позиция для ключевого слова '{keyword.keyword}' добавлена с позицией: {position} и частотностью: {frequency}")
        return True

    except Exception as e:
        logger.error(f"Error в process_single_keyword_position для '{keyword.keyword}': {e}", exc_info=True)
        raise


def wait_for_positions(project_id, region_key, date_today: datetime, max_wait=900, interval=30):
    start_time = datetime.utcnow()

    logger.info("Запрашиваем позиции")

    while (datetime.utcnow() - start_time).total_seconds() < max_wait:
        keywords_data = get_positions_topvisor(project_id, region_key, date_today, searcher_key=0)
        logger.info(f"Получен ответ на запрос {keywords_data}")

        if keywords_data:
            # проверяем, есть ли в ключевых словах реальные позиции
            if all(isinstance(item.get("positionsData"), dict) and len(item["positionsData"]) > 0 for item in
                   keywords_data):
                return keywords_data

        logger.info("Данные позиций ещё не готовы, ждем...")
        time.sleep(interval)  # Блокируем выполнение на interval секунд

    logger.warning("Превышено время ожидания получения позиций")
    return None


def main_task(project_ids: List[UUID], session_db):
    failed = []

    # Нужная дата
    #date_today = datetime(2025, 11, 5, 0, 0, 0)

    # Текущая дата
    date_today = datetime.utcnow()

    groups_to_wait = []  # Список групп, для которых запущен процесс снятия позиций

    for project_id in project_ids:
        project = session_db.query(Project).options(
            selectinload(Project.groups).selectinload(Group.keywords)
        ).filter(Project.id == project_id).first()

        if not project:
            logger.error(f"Project {project_id} not found")
            continue

        for group in project.groups:
            if not group.topvisor_id or not group.keywords or not group.is_archived:
                if not group.is_archived:
                    logger.info(f"Group {group.id} is archived, skipping")
                failed.extend([(project.id, kw.id) for kw in group.keywords if kw.is_check])
                continue

            region_key, region_index = get_region_key_index_static(group.region)

            # Проверяем наличие позиций
            positions = get_positions_topvisor(group.topvisor_id, region_index, date_today)

            has_positions = positions and all(
                isinstance(item.get("positionsData"), dict) and len(item["positionsData"]) > 0 for item in positions)

            if has_positions:
                # Получаем частотности
                volumes_data = get_keyword_volumes(group.topvisor_id, region_key, searcher_key=0, type_volume=1)
                frequency_map = {}
                if volumes_data:
                    volume_field_name = None
                    first_volume_item = volumes_data[0] if volumes_data else {}
                    for field in first_volume_item.keys():
                        if field.startswith("volume:"):
                            volume_field_name = field
                            break
                    if volume_field_name:
                        for item in volumes_data:
                            name = item.get("name", "").lower()
                            val = item.get(volume_field_name)
                            try:
                                frequency_map[name] = int(val) if val is not None else None
                            except Exception:
                                frequency_map[name] = None

                logger.info(f"Frequency map contents: {list(frequency_map.items())}")

                # Обрабатываем ключевые слова, записываем в БД
                for kw in [k for k in group.keywords if k.is_check]:
                    try:
                        # todo
                        process_single_keyword_position(session_db, positions, frequency_map, kw,
                                                        project.domain, group.topvisor_id, region_index, date_today)
                    except Exception as e:
                        logger.error(f"Error processing keyword {kw.keyword} in group {group.title}: {e}",
                                     exc_info=True)
                        failed.append((project.id, kw.id))

                session_db.commit()

            else:
                # Если позиций нет, запускаем процесс и сохраняем группу для дальнейшего опроса
                start_resp = start_topvisor_position_check(group.topvisor_id)

                if not start_resp:
                    logger.error(f"Failed to start position check for group {group.title}")
                    failed.extend([(project.id, kw.id) for kw in group.keywords if kw.is_check])
                    continue

                groups_to_wait.append((group.topvisor_id, region_index, project, group))

    # Второй этап: запрос позиций для групп, где был запущен процесс снятия
    for topvisor_id, region_index, project, group in groups_to_wait:
        positions = wait_for_positions(topvisor_id, region_index, date_today, max_wait=900, interval=30)
        if positions:
            volumes_data = get_keyword_volumes(topvisor_id, region_index, searcher_key=0, type_volume=1)
            frequency_map = {}
            if volumes_data:
                volume_field_name = None
                first_volume_item = volumes_data[0] if volumes_data else {}
                for field in first_volume_item.keys():
                    if field.startswith("volume:"):
                        volume_field_name = field
                        break
                if volume_field_name:
                    for item in volumes_data:
                        name = item.get("name", "").lower()
                        val = item.get(volume_field_name)
                        try:
                            frequency_map[name] = int(val) if val is not None else None
                        except Exception:
                            frequency_map[name] = None

            for kw in [k for k in group.keywords if k.is_check]:
                try:
                    process_single_keyword_position(session_db, positions, frequency_map, kw,
                                                    project.domain, group.topvisor_id, region_index, date_today)
                except Exception as e:
                    logger.error(f"Error processing keyword {kw.keyword} in group {group.title}: {e}",
                                 exc_info=True)
                    failed.append((project.id, kw.id))

            session_db.commit()
        else:
            logger.warning(f"Positions not received for group {group.title} after waiting")
            failed.extend([(project.id, kw.id) for kw in group.keywords if kw.is_check])

    return True, None


@celery_app.task(bind=True)
def run_main_task_one_project(self, project_id_str):
    logger.info(f"start task for project with id: {project_id_str}")
    project_id = UUID(project_id_str)
    try:
        with SyncSessionLocal() as session_db:
            success, error = main_task([project_id], session_db)
            # Обновляйте статус задачи в базе, логгируйте и т.д.
            return {"success": success, "error": error}
    except Exception as e:
        logger.error(f"run_main_task failed: {e}", exc_info=True)
        raise


@celery_app.task(bind=True)
def run_main_task(self):
    logger.info(f"START run_main_task: TOPVIZOR_ID={TOPVIZOR_ID}, API_KEY set={bool(TOPVIZOR_API_KEY)}")
    task_id = self.request.id

    try:
        with SyncSessionLocal() as session_db:
            # Создаём запись о начале задачи
            task_status = TaskStatus(
                task_id=task_id,
                task_name="run_main_task",
                status="in_progress",
                started_at=datetime.utcnow()
            )
            session_db.add(task_status)
            session_db.commit()

            # Загрузка проектов с группами и ключевыми словами (синхронно)
            projects = (
                session_db.query(Project)
                .join(Project.groups)
                .filter(Group.topvisor_id != None)
                .options(selectinload(Project.groups).selectinload(Group.keywords))
                .all()
            )

            if not projects:
                logger.info("No projects with topvisor_id found for processing.")
                task_status.status = "completed"
                task_status.finished_at = datetime.utcnow()
                task_status.result = {"message": "No projects found"}
                session_db.commit()
                return {"message": "No projects found"}

            project_ids = [project.id for project in projects]
            logger.info(f"Found {len(project_ids)} projects to process.")

            # Вызываем синхронную функцию main_task
            success, error = main_task(project_ids, session_db)

            failed = []
            access_denied_domains = []

            if not success:
                logger.warning(f"Processing failed with error: {error}")
                failed = [str(pid) for pid in project_ids]
            else:
                logger.info("All projects processed successfully.")

            success, error = main_task(project_ids, session_db)

            task_status.status = "completed"
            task_status.finished_at = datetime.utcnow()
            task_status.result = {
                "failed_projects": failed,
                "access_denied_domains": access_denied_domains
            }
            session_db.commit()

            return {
                "failed_projects": failed,
                "access_denied_domains": access_denied_domains
            }

    except Exception as e:
        logger.error(f"run_main_task failed: {e}", exc_info=True)
        raise
