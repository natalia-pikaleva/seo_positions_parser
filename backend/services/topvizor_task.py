from database.models import Project, Keyword, Position, TrendEnum, Group
from datetime import datetime
import json
from services.celery_app import celery_app
import os
from dotenv import load_dotenv
from typing import List, Tuple, Optional
import logging
import asyncio
import aiohttp
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from services.topvizor_utils import (get_project_info_by_topvizor,
                                     add_searcher_region,
                                     add_searcher_to_project,
                                     retry_request,
                                     get_region_key_index_static,
                                     get_keyword_volumes)
from database.models import TaskStatus

logger = logging.getLogger(__name__)

load_dotenv()

TOPVIZOR_ID = os.getenv("TOPVIZOR_ID", "")
TOPVIZOR_API_KEY = os.getenv("TOPVIZOR_API_KEY", "")

DB_USER = os.getenv("POSTGRES_USER", "amin")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "my_super_password")
DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = os.getenv("POSTGRES_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "seo_parser_db")

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
DATABASE_URL_ASYNC = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
engine = create_async_engine(DATABASE_URL_ASYNC)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def start_topvisor_position_check(session_http: aiohttp.ClientSession, topvisor_project_id: int):
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
        data = await retry_request(session_http, url, payload, headers, max_retries=5, delay=20)
        logger.info(f"Position check response data: {data}")
        return data
    except Exception as e:
        logger.error(f"Exception in start_topvisor_position_check for project {topvisor_project_id}: {e}",
                     exc_info=True)
        return None


async def get_positions_topvisor(session_http: aiohttp.ClientSession,
                                 project_id: int,
                                 region_key: int,
                                 date: str,
                                 searcher_key: int,
                                 max_retries: int = 5,
                                 delay: int = 20):
    url = "https://api.topvisor.com/v2/json/get/positions_2/history"
    headers = {
        "User-Id": TOPVIZOR_ID,
        "Authorization": TOPVIZOR_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "project_id": project_id,
        "regions_indexes": [region_key],
        "searcher_keys": [searcher_key],  # например, Яндекс
        "dates": [date],
        "show_headers": True,
        "show_tops": True
    }
    logger.info(
        f"Запрос в Topvisor: project_id={project_id}, searcher_keys={[searcher_key]}, "
        f"regions_indexes={[region_key]}, date1={date}, date2={date}"
    )

    try:
        data = await retry_request(session_http, url, payload, headers, max_retries=max_retries, delay=delay)
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


async def fetch_all_positions(session_http: aiohttp.ClientSession, project_id: int, region_key: int, date: str):
    # Получаем все позиции проекта за регион и дату (один запрос)
    return await get_positions_topvisor(session_http, project_id, region_key, date, searcher_key=0)


async def process_single_keyword_position(session_db: AsyncSession, position_data: list, frequency_map: dict,
                                          keyword: Keyword,
                                          domain: str, project_id: int, region_index: int, date: str) -> bool:
    try:
        logger.info(f"Обработка ключевого слова '{keyword.keyword}'")
        position = None
        frequency = None
        keyword_text = keyword.keyword.lower()

        for item in position_data:
            if item.get("name", "").lower() == keyword_text:
                positions_data = item.get("positionsData", {})
                logger.info(f"PositionsData для ключа '{keyword.keyword}': {positions_data}")

                key_for_date = f"{date}:{project_id}:{region_index}"
                pos_info = positions_data.get(key_for_date)

                # Если позиций нет или pos_info нет - не считаем за ошибку, а просто position остаётся None
                if pos_info is not None:
                    pos_value = pos_info.get("position")
                    if pos_value != "--" and pos_value is not None:
                        try:
                            position = int(pos_value)
                            logger.info(f"Найдена позиция для ключа '{keyword.keyword}': {position}")
                        except (TypeError, ValueError) as e:
                            logger.warning(
                                f"Некорректное значение позиции для ключа '{keyword.keyword}': {pos_value}, ошибка: {e}")

                # Получаем частотность из переданного словаря
                frequency = frequency_map.get(keyword_text)
                logger.info(f"Частотность для ключа '{keyword.keyword}': {frequency}")

                break  # нашли нужный ключ, выходим из цикла

        # Если нет ни позиции, ни частотности — не создаём запись
        if position is None and (frequency is None or frequency == '-'):
            logger.info(f"Нет позиции и частотности для ключевого слова '{keyword.keyword}', запись не создаётся")
            return False

        # Получаем последнюю сохранённую позицию из БД
        stmt = (
            select(Position)
            .filter(Position.keyword_id == keyword.id)
            .order_by(Position.checked_at.desc())
            .limit(1)
        )
        result = await session_db.execute(stmt)
        last_pos = result.scalars().first()
        previous_position = last_pos.position if last_pos else None
        logger.info(f"Прошлая позиция для ключа '{keyword.keyword}': {previous_position}")

        # Расчёт стоимости
        if position is None or position > 10:
            cost = 0
        elif 1 <= position <= 3:
            cost = keyword.price_top_1_3
        elif 4 <= position <= 5:
            cost = keyword.price_top_4_5
        else:
            cost = keyword.price_top_6_10
        logger.info(f"Рассчитанная стоимость для ключа '{keyword.keyword}': {cost}")

        # Определение тренда изменения позиции
        if previous_position is None or position is None:
            trend = TrendEnum.stable
        elif position < previous_position:
            trend = TrendEnum.up
        elif position > previous_position:
            trend = TrendEnum.down
        else:
            trend = TrendEnum.stable
        logger.info(f"Тренд для ключа '{keyword.keyword}': {trend}")

        # Создаём запись позиции с частотностью и позицией (которая может быть None)
        pos_record = Position(
            keyword_id=keyword.id,
            checked_at=datetime.utcnow(),
            position=position,
            frequency=frequency,
            previous_position=previous_position,
            cost=cost,
            trend=trend,
        )
        session_db.add(pos_record)
        logger.info(
            f"Позиция для ключевого слова '{keyword.keyword}' добавлена в сессию с позицией: {position} и частотностью: {frequency}")
        return True

    except Exception as e:
        logger.error(f"Error в process_single_keyword_position для '{keyword.keyword}': {e}", exc_info=True)
        raise


async def process_keyword_wrapper(semaphore, session_db, all_positions_data, frequency_map, kw, domain, project_id,
                                  failed_keywords_local, region_index, date, topvisor_project_id):
    async with semaphore:
        try:

            logger.info(f"Начинаем обработку ключевого слова '{kw.keyword}'")
            success = await process_single_keyword_position(session_db, all_positions_data, frequency_map, kw, domain,
                                                            topvisor_project_id, region_index, date)
            if not success:
                logger.warning(f"Позиция не обновлена для ключевого слова '{kw.keyword}'")
                failed_keywords_local.append((project_id, kw.id))
            else:
                logger.info(f"Ключевое слово '{kw.keyword}' обработано успешно")
        except Exception as e:
            logger.error(f"Ошибка обработки ключевого слова '{kw.keyword}' в проекте {project_id}: {e}", exc_info=True)
            failed_keywords_local.append((project_id, kw.id))


async def process_all_keywords_together_by_id(
        session_db: AsyncSession,
        session_http: aiohttp.ClientSession,
        project_id: UUID,
        semaphore: asyncio.Semaphore,
        region_index: int,
        date: str,
        topvisor_project_id: int,
):
    # Загружаем проект с ключевыми словами одним запросом
    result = await session_db.execute(
        select(Project)
        .options(selectinload(Project.keywords))
        .where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        logger.error(f"Проект с id={project_id} не найден")
        return []

    logger.info(
        f"Начинаем обработку проекта {project.id} с {len(project.keywords)} ключевыми словами для даты {date} и региона {region_index}")

    async with semaphore:
        all_positions_data = await fetch_all_positions(session_http, topvisor_project_id, region_index, date)

    if not all_positions_data:
        logger.warning(f"Нет данных позиций для проекта {project.id}")
        return [(project.id, kw.id) for kw in project.keywords if kw.is_check]

    failed_keywords_local = []

    date_today = datetime.utcnow().strftime("%Y-%m-%d")

    tasks = [
        process_keyword_wrapper(
            semaphore,
            session_db,
            all_positions_data,
            kw,
            project.domain,
            project.id,
            failed_keywords_local,
            region_index,
            date_today,
            topvisor_project_id
        )
        for kw in project.keywords if kw.is_check
    ]

    logger.info(f"Запускаем обработку для {len(tasks)} ключевых слов")

    await asyncio.gather(*tasks)

    logger.info(f"Обработка проекта {project.id} завершена, неудачных ключевых слов: {len(failed_keywords_local)}")

    return failed_keywords_local


async def wait_for_positions(session_http, project_id, region_key, max_wait=900, interval=30):
    date_today = datetime.utcnow().strftime("%Y-%m-%d")
    start_time = datetime.utcnow()

    logger.info("Запрашиваем позиции")

    while (datetime.utcnow() - start_time).total_seconds() < max_wait:
        keywords_data = await get_positions_topvisor(session_http, project_id, region_key,
                                                     date_today, searcher_key=0)
        logger.info(f"Получен ответ на запрос {keywords_data}")

        if keywords_data:
            # проверяем, есть ли в ключевых словах реальные позиции
            if all(isinstance(item.get("positionsData"), dict) and len(item["positionsData"]) > 0 for item in
                   keywords_data):
                return keywords_data

        logger.info("Данные позиций ещё не готовы, ждем...")
        await asyncio.sleep(interval)

    logger.warning("Превышено время ожидания получения позиций")
    return None


async def get_or_start_positions(session_http: aiohttp.ClientSession, project_id: int, region_index: int, date: str):
    try:
        logger.info(f"Проверяем наличие позиций за {date} для проекта {project_id}")
        positions = await get_positions_topvisor(session_http, project_id, region_index, date, searcher_key=0)

        if positions and all(
                isinstance(item.get("positionsData"), dict) and len(item["positionsData"]) > 0 for item in positions):
            logger.info(f"Позиции за {date} найдены на Topvisor для проекта {project_id}: {positions}")
            return positions

        logger.info(f"Позиции за {date} отсутствуют. Запускаем процесс снятия позиций для проекта {project_id}")
        start_resp = await start_topvisor_position_check(session_http, project_id)
        if not start_resp:
            logger.error("Не удалось запустить снятие позиций в Topvisor")
            return None

        positions = await wait_for_positions(session_http, project_id, region_index)
        if positions:
            logger.info(f"Позиции получены после запуска снятия для проекта {project_id}: {positions}")
            return positions
        else:
            logger.warning(f"Позиции не получили после запуска снятия для проекта {project_id}")
            return None

    except aiohttp.ClientError as e:
        logger.error(f"HTTP ошибка при работе с Topvisor для проекта {project_id}: {e}", exc_info=True)
    except asyncio.TimeoutError:
        logger.error(f"Timeout при работе с Topvisor для проекта {project_id}", exc_info=True)
    except Exception as e:
        logger.error(f"Неожиданная ошибка в get_or_start_positions для проекта {project_id}: {e}", exc_info=True)

    return None


async def main_task(project_id: UUID):
    semaphore = asyncio.Semaphore(1)

    async with aiohttp.ClientSession() as session_http, AsyncSessionLocal() as session_db:
        result = await session_db.execute(
            select(Project)
            .options(
                selectinload(Project.groups).selectinload(Group.keywords)
            )
            .where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            logger.error(f"Project with id={project_id} not found")
            return False, "not_found"

        failed = []

        def has_access_error(response):
            if isinstance(response, dict) and "errors" in response:
                for err in response["errors"]:
                    if err.get("code") == 54:
                        return True
            return False

        date_today = datetime.utcnow().strftime("%Y-%m-%d")

        for group in project.groups:
            group_topvisor_id = group.topvisor_id
            if not group_topvisor_id:
                logger.warning(f"Group {group.title} does not have topvisor_id, skipped")
                failed.extend([(project.id, kw.id) for kw in group.keywords if kw.is_check])
                continue

            logger.info(f"Processing group {group.title} with Topvisor ID {group_topvisor_id}")

            # Получаем регион из группы
            region_key, region_index = await get_region_key_index_static(group.region) or (213, 1)

            # Получаем информацию по группе-проекту в Topvisor
            try:
                data = await get_project_info_by_topvizor(group_topvisor_id)
                logger.info(f"Topvisor group info for {group.title}: {data}")
                if has_access_error(data):
                    logger.error(f"Access denied for group info of {group.title}")
                    failed.extend([(project.id, kw.id) for kw in group.keywords if kw.is_check])
                    continue
            except Exception as e:
                logger.error(f"Error getting group info from Topvisor for {group.title}: {e}", exc_info=True)
                failed.extend([(project.id, kw.id) for kw in group.keywords if kw.is_check])
                continue

            # Добавляем поисковика для группы/проекта в Topvisor
            try:
                resp = await add_searcher_to_project(session_http, group_topvisor_id, searcher_key=0)
                if has_access_error(resp):
                    logger.error(f"Access denied adding searcher for group {group.title}")
                    failed.extend([(project.id, kw.id) for kw in group.keywords if kw.is_check])
                    continue
            except Exception as e:
                logger.error(f"Error adding searcher to group {group.title}: {e}", exc_info=True)
                failed.extend([(project.id, kw.id) for kw in group.keywords if kw.is_check])
                continue

            # Добавляем регион поисковика для группы
            try:
                resp = await add_searcher_region(session_http, group_topvisor_id, searcher_key=0, region_key=region_key)
                if has_access_error(resp):
                    logger.error(f"Access denied adding searcher region for group {group.title}")
                    failed.extend([(project.id, kw.id) for kw in group.keywords if kw.is_check])
                    continue
            except Exception as e:
                logger.error(f"Error adding searcher region to group {group.title}: {e}", exc_info=True)
                failed.extend([(project.id, kw.id) for kw in group.keywords if kw.is_check])
                continue

            # Получаем позиции для группы в Topvisor
            positions_data = await get_or_start_positions(session_http, group_topvisor_id, region_index, date_today)
            volumes_data = await get_keyword_volumes(session_http, group_topvisor_id, region_key, searcher_key=0,
                                                     type_volume=1)

            frequency_map = {}
            if volumes_data:
                volume_field_name = None
                first_volume_item = volumes_data[0] if len(volumes_data) > 0 else {}
                for field in first_volume_item.keys():
                    if field.startswith("volume:"):
                        volume_field_name = field
                        break
                if volume_field_name:
                    for item in volumes_data:
                        name = item.get("name", "").lower()
                        val = item.get(volume_field_name)
                        if val is not None:
                            try:
                                frequency_map[name] = int(val)
                            except Exception:
                                frequency_map[name] = None

            # Обрабатываем ключи с передачей и позиций, и частотности
            for kw in [k for k in group.keywords if k.is_check]:
                try:
                    await process_keyword_wrapper(
                        semaphore,
                        session_db,
                        positions_data,
                        frequency_map,
                        kw,
                        project.domain,
                        project.id,
                        failed,
                        region_index,
                        date_today,
                        group_topvisor_id,
                    )

                except Exception as e:
                    logger.error(f"Error processing keyword {kw.keyword} in group {group.title}: {e}", exc_info=True)
                    failed.append((project.id, kw.id))

        # Коммитим один раз после обработки всех групп
        try:
            await session_db.commit()
            logger.info(f"Database commit successful for project {project.domain}")
        except Exception as e:
            logger.error(f"Error during DB commit for project {project.domain}: {e}", exc_info=True)
            await session_db.rollback()

        logger.info(f"Position update completed for project {project.domain}. Failed keywords count: {len(failed)}")

        return True, None


@celery_app.task(bind=True)
def run_main_task(self):
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        # В случае отсутствия event loop, создаём новый
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(run_main_task_async(self))


async def run_main_task_async(self):
    logger.info(f"START run_main_task: TOPVIZOR_ID={TOPVIZOR_ID}, API_KEY set={bool(TOPVIZOR_API_KEY)}")
    task_id = self.request.id

    async with AsyncSessionLocal() as session_db:
        # Создаём/сохраняем запись о начале задачи
        task_status = TaskStatus(
            task_id=task_id,
            task_name="run_main_task",
            status="in_progress",
            started_at=datetime.utcnow()
        )
        session_db.add(task_status)
        await session_db.commit()

        try:
            result = await session_db.execute(
                select(Project)
                .options(
                    selectinload(Project.groups).selectinload(Group.keywords),
                )
                .where(Project.topvisor_id.isnot(None))
            )
            projects = result.scalars().all()

            if not projects:
                logger.info("No projects with topvisor_id found for processing.")
                # Обновляем статус задачи в базе
                task_status.status = "completed"
                task_status.finished_at = datetime.utcnow()
                task_status.result = {"message": "No projects found"}
                await session_db.commit()
                return {"message": "No projects found"}

            logger.info(f"Found {len(projects)} projects to process.")

            failed = []
            access_denied_domains = []

            for project in projects:
                logger.info(f"Start processing project id={project.id}, domain={project.domain}")
                try:
                    success, error = await main_task(project.id)

                    if not success:
                        logger.warning(f"Project {project.domain} processing failed with error: {error}")
                        failed.append(str(project.id))
                        if error == "access_denied":
                            access_denied_domains.append(project.domain)
                        continue
                    logger.info(f"Finished processing project id={project.id}, domain={project.domain}")
                except Exception as e:
                    logger.error(f"Error processing project id={project.id}: {e}", exc_info=True)
                    failed.append(str(project.id))

            if access_denied_domains:
                logger.warning(f"Projects skipped due to access denied: {access_denied_domains}")

            if failed:
                logger.warning(f"Failed projects: {failed}")
            else:
                logger.info("All projects processed successfully.")

            # Обновляем статус задачи с результатом
            task_status.status = "completed"
            task_status.finished_at = datetime.utcnow()
            task_status.result = {
                "failed_projects": failed,
                "access_denied_domains": access_denied_domains
            }
            await session_db.commit()

            return {
                "failed_projects": failed,
                "access_denied_domains": access_denied_domains
            }

        except Exception as e:
            await session_db.rollback()
            task_status.status = "failed"
            task_status.finished_at = datetime.utcnow()
            task_status.error_message = str(e)
            await session_db.commit()

            logger.error(f"run_main_task failed: {e}", exc_info=True)
            raise
