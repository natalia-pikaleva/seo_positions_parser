from fastapi import APIRouter, HTTPException, Depends, Query, status
from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta, date
import logging
from database.db_init import get_db
from database.models import Project, Keyword, Position, Group, SearchEngineEnum
from routers.schemas import (ProjectCreate, ProjectUpdate, KeywordUpdate,
                             ProjectOut, ClientProjectOut, PositionOut,
                             KeywordCreate, KeywordUpdate, KeywordOut,
                             IntervalSumOut, KeywordIntervals, GroupOut,
                             GroupCreate, GroupUpdate)


from services.topvizor_utils import (create_project_in_topvisor,
                                     add_or_update_keyword_topvisor,
                                     delete_keyword_topvisor,
                                     delete_project_topvisor,
                                     update_project_topvisor,
                                     import_keywords,
                                     get_region_key_index_static,
                                     add_searcher_to_project,
                                     add_searcher_region)

import aiohttp
import os
from dotenv import load_dotenv

load_dotenv()

TOPVIZOR_ID = os.getenv('TOPVIZOR_ID')
TOPVIZOR_API_KEY = os.getenv('TOPVIZOR_API_KEY')

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Группы

@router.post("/", response_model=ProjectOut, status_code=201)
async def create_group(group_in: GroupCreate, db: AsyncSession = Depends(get_db)):
    try:
        # Проверяем существование проекта
        project = await db.get(Project, group_in.project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Создаём сессию aiohttp для Topvisor API
        async with aiohttp.ClientSession() as session_http:
            topvisor_project_name = f"{project.domain} - {group_in.title}"
            topvisor_group_id = await create_project_in_topvisor(session_http,
                                                                 url=project.domain,
                                                                 name=topvisor_project_name)
            if not topvisor_group_id:
                logging.error(f"Не удалось создать проект в Topvisor для группы {group_in.title}")
                raise HTTPException(status_code=500, detail="Ошибка создания проекта в Topvisor")

            group = Group(
                title=group_in.title,
                region=group_in.region,
                search_engine=group_in.search_engine,
                topvisor_id=int(topvisor_group_id),
                project_id=group_in.project_id
            )

            # Добавляем поисковую систему
            searcher_key = 0 if group_in.search_engine == SearchEngineEnum.yandex else 1
            searcher_result = await add_searcher_to_project(session_http, int(topvisor_group_id), searcher_key)
            if searcher_result is None:
                logging.error(f"Не удалось добавить поисковую систему для группы {group_in.title}")
                raise HTTPException(status_code=500, detail="Ошибка добавления поисковой системы в Topvisor")

            # Получаем ключ региона
            region_key, _ = await get_region_key_index_static(group_in.region)
            if region_key is None:
                logging.error(f"Регион не найден для группы {group_in.title}")
                raise HTTPException(status_code=400, detail="Некорректный регион")

            region_result = await add_searcher_region(
                session_http,
                int(topvisor_group_id),
                searcher_key,
                region_key,
                region_lang="ru"
            )
            if region_result is None:
                logging.error(f"Не удалось добавить регион для группы {group_in.title}")
                raise HTTPException(status_code=500, detail="Ошибка добавления региона в Topvisor")

            db.add(group)
            await db.commit()
            await db.refresh(group)

            # Загружаем полный проект с группами и ключевыми словами
            full_project_query = await db.execute(
                select(Project)
                .options(
                    selectinload(Project.groups).selectinload(Group.keywords)
                )
                .where(Project.id == group_in.project_id)
            )
            full_project = full_project_query.scalar_one_or_none()

            if not full_project:
                raise HTTPException(status_code=404, detail="Project not found after creating group")

            return full_project

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Ошибка при создании группы: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create group")


@router.put("/{group_id}", response_model=ProjectOut)
async def update_group(
        group_id: UUID,
        group_in: GroupUpdate,
        db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(
            select(Group)
            .options(selectinload(Group.project))
            .where(Group.id == group_id)
        )
        group = result.scalar_one_or_none()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        update_data = group_in.dict(exclude_unset=True, by_alias=False)

        # Флаг поменялось ли доменное имя проекта (domain) в родительском проекте нет, но search_engine, region или title - могут поменяться
        domain_of_project = None
        if not group.project:
            # Возможный случай, если relationship не загрузился
            project = await db.get(Project, group.project_id)
        else:
            project = group.project
        domain_of_project = project.domain if project else None

        async with aiohttp.ClientSession() as session_http:
            # Обновляем в Topvisor имя проекта-группы, если изменилось название группы или домен проекта (нужно перегенерировать имя)
            need_rename = False
            new_topvisor_name = None
            if "title" in update_data and update_data["title"] != group.title:
                need_rename = True
            if domain_of_project and "project_id" in update_data and update_data["project_id"] != group.project_id:
                # Если меняется проект, логика сложнее — обычно не меняем project_id, если нужно, обрабатывайте отдельно
                pass

            if need_rename and domain_of_project:
                new_topvisor_name = f"{domain_of_project} - {update_data.get('title', group.title)}"
            elif not need_rename:
                new_topvisor_name = None

            if new_topvisor_name and group.topvisor_id:
                try:
                    await update_project_topvisor(group.topvisor_id, {"name": new_topvisor_name})
                except Exception as e:
                    logging.error(f"Ошибка обновления имени группы в Topvisor: {e}")
                    raise HTTPException(status_code=500, detail="Failed to update group name in Topvisor")

            # Если меняется поисковая система или регион - обновляем их тоже
            if "search_engine" in update_data or "region" in update_data:
                search_engine = update_data.get("search_engine", group.search_engine)
                region = update_data.get("region", group.region)

                searcher_key = 0 if search_engine == SearchEngineEnum.yandex else 1

                # Апдейт searcher
                if group.topvisor_id:
                    searcher_result = await add_searcher_to_project(session_http, group.topvisor_id, searcher_key)
                    if searcher_result is None:
                        raise HTTPException(status_code=500, detail="Failed to update search engine in Topvisor")

                # Апдейт региона
                region_key, _ = await get_region_key_index_static(region)
                if region_key is None:
                    raise HTTPException(status_code=400, detail="Invalid region for group")

                if group.topvisor_id:
                    region_result = await add_searcher_region(
                        session_http,
                        group.topvisor_id,
                        searcher_key,
                        region_key,
                        region_lang="ru"
                    )
                    if region_result is None:
                        raise HTTPException(status_code=500, detail="Failed to update region in Topvisor")

            # Обновляем поля локально в БД
            for key, value in update_data.items():
                setattr(group, key, value)

            await db.commit()
            await db.refresh(group)
            full_project_query = await db.execute(
                select(Project)
                .options(
                    selectinload(Project.groups).selectinload(Group.keywords)
                )
                .where(Project.id == group.project_id)
            )
            full_project = full_project_query.scalar_one_or_none()

            if not full_project:
                raise HTTPException(status_code=404, detail="Project not found")

            return full_project

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Ошибка при обновлении группы: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update group")


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(group_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(Group).where(Group.id == group_id)
        )
        group = result.scalar_one_or_none()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        # Удаляем проект с Topvisor
        if group.topvisor_id:
            try:
                await delete_project_topvisor(group.topvisor_id)
            except Exception as e:
                logging.error(f"Не удалось удалить проект Topvisor с ID {group.topvisor_id}: {e}")
                raise HTTPException(status_code=500, detail="Ошибка удаления группы из Topvisor")

        await db.delete(group)
        await db.commit()
        return

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to delete group: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete group")


@router.get("/{group_id}", response_model=GroupOut)
async def get_group(
        group_id: UUID,
        db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(
            select(Group)
            .options(selectinload(Group.keywords))  # жёсткая загрузка ключевых слов
            .where(Group.id == group_id)
        )
        group = result.scalar_one_or_none()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        return group

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to get group by id: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get group")


# --- Ключевые слова и позиции ---


@router.get("/{group_id}/keywords", response_model=List[KeywordOut])
async def get_keywords(group_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(Keyword).where(Keyword.group_id == group_id))
        keywords = result.scalars().all()
        return keywords
    except Exception as e:
        logging.error("Failed to get keywords: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get keywords")


@router.post("/{group_id}/keywords", response_model=KeywordOut)
async def create_keyword(group_id: UUID, keyword_in: KeywordCreate, db: AsyncSession = Depends(get_db)):
    try:
        # Проверяем, что группа существует
        group = await db.get(Group, group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        # Опционально: проверяем, что такой ключ уже не существует в группе
        existing_keyword = await db.execute(
            select(Keyword).where(Keyword.group_id == group_id, Keyword.keyword == keyword_in.keyword)
        )
        if existing_keyword.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Keyword already exists in this group")

        # Добавляем ключ в Topvisor
        response = await add_or_update_keyword_topvisor(group.topvisor_id, keyword_in.keyword)
        if not response or "result" not in response:
            logging.error(f"Не удалось добавить ключевое слово в Topvisor: {keyword_in.keyword}")
            raise HTTPException(status_code=500, detail="Ошибка создания ключевого слова в Topvisor")

        # Создаём новый ключ и сохраняем в бд
        new_keyword = Keyword(
            group_id=group_id,
            keyword=keyword_in.keyword,
            priority=keyword_in.priority if keyword_in.priority is not None else False,
            price_top_1_3=keyword_in.price_top_1_3,
            price_top_4_5=keyword_in.price_top_4_5,
            price_top_6_10=keyword_in.price_top_6_10,
            is_check=True
        )
        db.add(new_keyword)
        await db.commit()
        await db.refresh(new_keyword)

        return new_keyword  # если используете pydantic-модели с orm_mode=True

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Ошибка при создании ключевого слова: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create keyword")


@router.put("/{group_id}/keywords/{keyword_id}", response_model=KeywordOut)
async def update_keyword(
        group_id: UUID,
        keyword_id: UUID,
        keyword_in: KeywordUpdate,
        db: AsyncSession = Depends(get_db)
):
    try:
        # Загружаем ключ с загрузкой группы и проекта для валидации
        result = await db.execute(
            select(Keyword)
            .options(selectinload(Keyword.group).selectinload(Group.project))
            .where(Keyword.id == keyword_id)
        )
        keyword = result.scalar_one_or_none()

        if keyword is None or keyword.group_id != group_id:
            raise HTTPException(status_code=404, detail="Keyword not found in group")

        old_keyword_text = keyword.keyword
        old_group = keyword.group
        old_topvisor_id = old_group.topvisor_id if old_group else None

        update_data = keyword_in.dict(exclude_unset=True, by_alias=False)

        # Обработка смены группы (если указана новая группа)
        new_group_id = update_data.get("group_id")
        if new_group_id and new_group_id != old_group.id:
            # Загружаем новую группу
            new_group = await db.get(Group, new_group_id)
            if not new_group:
                raise HTTPException(status_code=400, detail="New group not found")
            # Проверяем, что новая группа в том же проекте
            if not old_group.project or new_group.project_id != old_group.project.id:
                raise HTTPException(status_code=400, detail="New group must belong to the same project")

            new_topvisor_id = new_group.topvisor_id

            # Удаляем ключ из проекта старой группы в Topvisor
            if old_topvisor_id:
                try:
                    await delete_keyword_topvisor(old_topvisor_id, old_keyword_text)
                except Exception as e:
                    logging.error(f"Failed to delete keyword from old Topvisor project: {e}", exc_info=True)
                    raise HTTPException(status_code=500, detail="Failed to delete old keyword in Topvisor")

            # Добавляем ключ в проект новой группы в Topvisor
            try:
                response = await add_or_update_keyword_topvisor(new_topvisor_id,
                                                                update_data.get("keyword", old_keyword_text))
                if not response or "result" not in response:
                    logging.error(
                        f"Failed to add keyword to new Topvisor project: {update_data.get('keyword', old_keyword_text)}")
                    raise HTTPException(status_code=500, detail="Failed to add keyword to Topvisor")
            except Exception as e:
                logging.error(f"Failed to add keyword to new Topvisor project: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail="Failed to add keyword to Topvisor")

            # Обновляем group_id в ключе локально
            keyword.group_id = new_group_id

        # Обновление текста ключа (если меняется) и других полей
        # Если перенос группы уже открыл "update_data", и ключ меняется, дополнительно синхронизируем
        new_keyword_text = update_data.get("keyword")
        if new_keyword_text and new_keyword_text != old_keyword_text and (
                not new_group_id or new_group_id == old_group.id):
            # Если не меняется группа, просто обновляем ключ в Topvisor для текущей группы
            topvisor_id = old_topvisor_id
            if topvisor_id:
                # Удаляем старый ключ
                try:
                    await delete_keyword_topvisor(topvisor_id, old_keyword_text)
                except Exception as e:
                    logging.error(f"Failed to delete old keyword in Topvisor: {e}", exc_info=True)
                    raise HTTPException(status_code=500, detail="Failed to delete old keyword in Topvisor")

                # Добавляем новый ключ
                try:
                    response = await add_or_update_keyword_topvisor(topvisor_id, new_keyword_text)
                    if not response or "result" not in response:
                        logging.error(f"Failed to add new keyword in Topvisor: {new_keyword_text}")
                        raise HTTPException(status_code=500, detail="Failed to add new keyword in Topvisor")
                except Exception as e:
                    logging.error(f"Failed to add new keyword in Topvisor: {e}", exc_info=True)
                    raise HTTPException(status_code=500, detail="Failed to add new keyword in Topvisor")

        # Обновляем остальные поля ключа (кроме id и group_id, которые уже обработаны)
        for key, value in update_data.items():
            if key not in {"id", "group_id", "keyword"}:
                setattr(keyword, key, value)

        # Если менялся ключ и группа одновременно — уже синхронизировали, но все равно обновим поле keyword
        if new_keyword_text:
            keyword.keyword = new_keyword_text

        await db.commit()
        await db.refresh(keyword)

        return keyword

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to update keyword: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update keyword")


@router.delete("/{group_id}/keywords/{keyword_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_keyword(
        group_id: UUID,
        keyword_id: UUID,
        db: AsyncSession = Depends(get_db)
):
    try:
        # Загружаем ключевое слово с группой вместе, чтобы избежать lazy load вне контекста
        result = await db.execute(
            select(Keyword)
            .options(selectinload(Keyword.group))
            .where(Keyword.id == keyword_id)
        )
        keyword = result.scalar_one_or_none()

        if not keyword or keyword.group_id != group_id:
            raise HTTPException(status_code=404, detail="Keyword not found in group")

        if not keyword.group.topvisor_id:
            logging.error(f"Group {keyword.group.id} does not have topvisor_id.")
            raise HTTPException(status_code=500, detail="Topvisor project ID missing for the group")

        # Удаляем ключ в Topvisor - если неудача, выброс Exception и не меняем БД
        await delete_keyword_topvisor(keyword.group.topvisor_id, keyword.keyword)

        await db.delete(keyword)
        await db.commit()
        return
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to delete keyword: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete keyword")


# --- Получение позиций с фильтром по периоду ---

@router.get("/{group_id}/positions", response_model=List[PositionOut])
async def get_positions(
        group_id: UUID,
        period: Optional[str] = Query("week", regex="^(week|month|custom)$"),
        offset: int = Query(0, description="Сдвиг периода: 0 — текущий, -1 — предыдущий и т.д."),
        db: AsyncSession = Depends(get_db)
):
    try:
        now = datetime.utcnow()

        if period == "week":
            current_weekday = now.weekday()  # 0 - понедельник
            start_of_current_week = datetime(now.year, now.month, now.day) - timedelta(days=current_weekday)
            start_date = start_of_current_week + timedelta(weeks=offset)
            end_date = start_date + timedelta(weeks=1)

        elif period == "month":
            start_of_current_month = datetime(now.year, now.month, 1)
            month = (start_of_current_month.month - 1) + offset
            year = start_of_current_month.year + month // 12
            month = month % 12 + 1
            start_date = datetime(year, month, 1)
            if month == 12:
                end_date = datetime(year + 1, 1, 1)
            else:
                end_date = datetime(year, month + 1, 1)

        else:
            start_date = None
            end_date = None

        # Запрос позиций через соединение с Keyword и фильтрацией по group_id
        stmt = (
            select(Position)
            .join(Position.keyword)
            .where(Keyword.group_id == group_id)
        )

        if start_date and end_date:
            stmt = stmt.where(Position.checked_at >= start_date, Position.checked_at < end_date)

        stmt = stmt.options(selectinload(Position.keyword))

        result = await db.execute(stmt)
        positions = result.scalars().all()
        return positions

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to get positions by period: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get positions by period")


@router.get("/{group_id}/positions/intervals", response_model=List[KeywordIntervals])
async def get_positions_intervals(
        group_id: UUID,
        period: str = Query("month", regex="^(week|month|custom)$"),
        offset: int = Query(0, description="Сдвиг периода: 0 — текущий, -1 — предыдущий и т.д."),
        db: AsyncSession = Depends(get_db)
):
    try:
        current_utc_date = datetime.utcnow().date()

        # 1. Определяем границы периода
        if period == "month":
            year = current_utc_date.year
            month = current_utc_date.month + offset
            while month > 12:
                month -= 12
                year += 1
            while month < 1:
                month += 12
                year -= 1

            period_display_start = date(year, month, 1)
            if month == 12:
                period_display_end = date(year + 1, 1, 1) - timedelta(days=1)
            else:
                period_display_end = date(year, month + 1, 1) - timedelta(days=1)

        elif period == "week":
            monday = current_utc_date - timedelta(days=current_utc_date.weekday())
            period_display_start = monday + timedelta(weeks=offset)
            period_display_end = period_display_start + timedelta(days=6)

        else:
            # Можно добавить параметры для custom, или вернуть все интервалы
            period_display_start = None
            period_display_end = None

        # 2. Получаем группу и дату создания проекта (родителя)
        group_result = await db.execute(
            select(Group)
            .options(selectinload(Group.project))
            .where(Group.id == group_id)
        )
        group = group_result.scalar_one_or_none()
        if not group or not group.project or not group.project.created_at:
            raise HTTPException(status_code=404, detail="Group or its project not found or creation date missing.")

        project_start_date = group.project.created_at.date()

        # 3. Генерируем все 14-дневные интервалы от даты создания проекта до конца отображаемого периода
        all_biweekly_intervals = []
        interval_start = project_start_date
        while interval_start <= period_display_end:
            interval_end = interval_start + timedelta(days=13)
            if interval_end > period_display_end:
                interval_end = period_display_end
            all_biweekly_intervals.append((interval_start, interval_end))
            interval_start += timedelta(days=14)

        # 4. Отбираем релевантные интервалы
        relevant_intervals = []
        for start_dt, end_dt in all_biweekly_intervals:
            if period_display_start and period_display_end:
                if start_dt <= period_display_end and end_dt >= period_display_start and end_dt <= current_utc_date:
                    display_start = max(start_dt, period_display_start)
                    display_end = min(end_dt, period_display_end)
                    relevant_intervals.append((start_dt, end_dt, display_start, display_end))
            else:
                if end_dt <= current_utc_date:
                    relevant_intervals.append((start_dt, end_dt, start_dt, end_dt))

        if not relevant_intervals:
            return []

        # 5. Получаем ключевые слова группы
        keywords_result = await db.execute(
            select(Keyword)
            .where(Keyword.group_id == group_id)
        )
        keywords = keywords_result.scalars().all()

        if not keywords:
            return []

        keyword_ids = [k.id for k in keywords]
        keywords_map = {k.id: k for k in keywords}

        # 6. Получаем позиции ключевых слов в диапазоне дат
        fetch_start_date = min(i[0] for i in relevant_intervals) - timedelta(days=14)
        fetch_end_date = max(i[1] for i in relevant_intervals)
        positions_result = await db.execute(
            select(Position)
            .where(
                Position.keyword_id.in_(keyword_ids),
                Position.checked_at >= fetch_start_date,
                Position.checked_at <= fetch_end_date + timedelta(days=1)
            )
        )
        positions = positions_result.scalars().all()

        # 7. Создаём карту позиций для быстрого доступа
        positions_map = {}
        for pos in positions:
            positions_map.setdefault(pos.keyword_id, {})[pos.checked_at.date()] = pos

        # 8. Подсчитываем суммы и формируем результат
        results = []
        for k_id in keyword_ids:
            keyword = keywords_map[k_id]
            intervals_data = []
            for start_dt, end_dt, display_start, display_end in relevant_intervals:
                days_top3 = 0
                days_top5 = 0
                days_top10 = 0

                current_date = start_dt
                while current_date <= end_dt:
                    pos = positions_map.get(k_id, {}).get(current_date)
                    if pos and pos.position is not None:
                        if 1 <= pos.position <= 3:
                            days_top3 += 1
                        elif 4 <= pos.position <= 5:
                            days_top5 += 1
                        elif 6 <= pos.position <= 10:
                            days_top10 += 1
                    current_date += timedelta(days=1)

                cost_top3 = days_top3 * (keyword.price_top_1_3 or 0)
                cost_top5 = days_top5 * (keyword.price_top_4_5 or 0)
                cost_top10 = days_top10 * (keyword.price_top_6_10 or 0)

                intervals_data.append(
                    IntervalSumOut(
                        start_date=start_dt,
                        end_date=end_dt,
                        display_start_date=display_start,
                        display_end_date=display_end,
                        sum_cost=cost_top3 + cost_top5 + cost_top10,
                        days_top3=days_top3,
                        cost_top3=keyword.price_top_1_3,
                        days_top5=days_top5,
                        cost_top5=keyword.price_top_4_5,
                        days_top10=days_top10,
                        cost_top10=keyword.price_top_6_10,
                    )
                )
            results.append(KeywordIntervals(keyword_id=k_id, intervals=intervals_data))

        return results

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to get positions intervals: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


# --- Переключение ключевых слов в состояние снятие позиций и отключение

@router.patch("/keywords/{keyword_id}/disable", status_code=status.HTTP_204_NO_CONTENT)
async def disable_keyword_check(keyword_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Keyword).where(Keyword.id == keyword_id))
    keyword = result.scalars().first()
    if not keyword:
        raise HTTPException(status_code=404, detail="Keyword not found")
    keyword.is_check = False
    await db.commit()
    return


@router.patch("/keywords/{keyword_id}/enable", status_code=status.HTTP_204_NO_CONTENT)
async def enable_keyword_check(keyword_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Keyword).where(Keyword.id == keyword_id))
    keyword = result.scalars().first()
    if not keyword:
        raise HTTPException(status_code=404, detail="Keyword not found")
    keyword.is_check = True
    await db.commit()
    return
