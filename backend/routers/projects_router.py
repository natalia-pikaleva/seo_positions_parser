from fastapi import APIRouter, HTTPException, Depends, Query, status
from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import desc
from fastapi.responses import StreamingResponse
import io
import pandas as pd
from datetime import datetime, timedelta, date
import logging

from database.db_init import get_db
from database.models import Project, Keyword, Position
from routers.schemas import ProjectCreate, ProjectUpdate, KeywordUpdate, ProjectOut, ClientProjectOut, \
    PositionOut, KeywordCreate, KeywordUpdate, KeywordOut, IntervalSumOut, KeywordIntervals
from services.task import parse_positions_by_project_task
from services.api_utils import generate_client_link

logger = logging.getLogger(__name__)

router = APIRouter()

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

# --- Проекты ---

@router.get("/", response_model=List[ProjectOut])
async def get_projects(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(Project).options(
                selectinload(Project.keywords)
            )
        )
        projects = result.scalars().all()
        return projects
    except Exception as e:
        logging.error("Failed to get projects: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get projects")


@router.post("/", response_model=ProjectOut, status_code=201)
async def create_project(project_in: ProjectCreate, db: AsyncSession = Depends(get_db)):
    try:
        project_data = project_in.dict(exclude={"keywords"}, by_alias=False)
        if "client_link" not in project_data:
            project_data["client_link"] = generate_client_link()

        if "created_at" not in project_data:
            project_data["created_at"] = datetime.utcnow()

        project = Project(**project_data)

        for kw_in in project_in.keywords:
            keyword = Keyword(
                keyword=kw_in.keyword,
                region=kw_in.region,
                price_top_1_3=kw_in.price_top_1_3,
                price_top_4_5=kw_in.price_top_4_5,
                price_top_6_10=kw_in.price_top_6_10,
                is_check=True
            )
            project.keywords.append(keyword)

        db.add(project)
        await db.commit()
        await db.refresh(project)
        await db.refresh(project, attribute_names=["keywords"])

        logger.info(f"project.created_at: {project.created_at}, project.client_link: {project.client_link}")

        return project
    except HTTPException:
        raise
    except Exception as e:
        logging.error("Failed to create project: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create project")



@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(Project)
            .options(selectinload(Project.keywords))  # жёсткая загрузка ключевых слов
            .where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project
    except HTTPException:
        raise
    except Exception as e:
        logging.error("Failed to get project by id: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get project by id")


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(project_id: UUID, project_in: ProjectUpdate, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(Project)
            .options(selectinload(Project.keywords))  # жёсткая загрузка ключевых слов
            .where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        update_data = project_in.dict(exclude_unset=True, by_alias=False)
        # Убираем ключевые слова из обновления
        update_data.pop("keywords", None)

        for key, value in update_data.items():
            setattr(project, key, value)

        await db.commit()
        await db.refresh(project)
        return project
    except HTTPException:
        raise
    except Exception as e:
        logging.error("Failed to update project: %s", e)
        raise HTTPException(status_code=500, detail="Failed to update project")


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        project = await db.get(Project, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        await db.delete(project)
        await db.commit()
        return
    except HTTPException:
        raise
    except Exception as e:
        logging.error("Failed to delete project: %s", e)
        raise HTTPException(status_code=500, detail="Failed to delete project")


# --- Ключевые слова и позиции ---


@router.get("/{project_id}/keywords", response_model=List[KeywordOut])
async def get_keywords(project_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(Keyword).where(Keyword.project_id == project_id))
        keywords = result.scalars().all()
        return keywords
    except Exception as e:
        logging.error("Failed to get keywords: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get keywords")


@router.post("/{project_id}/keywords", response_model=KeywordOut)
async def create_keyword(
        project_id: UUID,
        keyword_in: KeywordCreate,
        db: AsyncSession = Depends(get_db)
):
    try:
        # Проверяем, что проект существует
        project = await db.get(Project, project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        # Создаём новое ключевое слово
        new_keyword = Keyword(
            project_id=project_id,
            keyword=keyword_in.keyword,
            region=keyword_in.region,
            price_top_1_3=keyword_in.price_top_1_3,
            price_top_4_5=keyword_in.price_top_4_5,
            price_top_6_10=keyword_in.price_top_6_10,
            is_check=True
        )
        db.add(new_keyword)
        await db.commit()
        await db.refresh(new_keyword)

        return new_keyword
    except HTTPException:
        raise
    except Exception as e:
        logging.error("Failed to create keyword: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create keyword")


@router.put("/{project_id}/keywords/{keyword_id}", response_model=KeywordOut)
async def update_keyword(
        project_id: UUID,
        keyword_id: UUID,
        keyword_in: KeywordUpdate,
        db: AsyncSession = Depends(get_db)
):
    try:
        keyword = await db.get(Keyword, keyword_id)
        if keyword is None or keyword.project_id != project_id:
            raise HTTPException(status_code=404, detail="Keyword not found in project")

        update_data = keyword_in.dict(exclude_unset=True, by_alias=False)
        for key, value in update_data.items():
            if key != "id":
                setattr(keyword, key, value)

        await db.commit()
        await db.refresh(keyword)

        return keyword

        result = await db.execute(select(Keyword).where(Keyword.project_id == project_id))
        keywords = result.scalars().all()
        return keywords
    except HTTPException:
        raise
    except Exception as e:
        logging.error("Failed to update keyword: %s", e)
        raise HTTPException(status_code=500, detail="Failed to update keyword")


@router.delete("/{project_id}/keywords/{keyword_id}", status_code=204)
async def delete_keyword(
        project_id: UUID,
        keyword_id: UUID,
        db: AsyncSession = Depends(get_db)
):
    try:
        # Проверяем, что ключевое слово существует и принадлежит проекту
        keyword = await db.get(Keyword, keyword_id)
        if not keyword or keyword.project_id != project_id:
            raise HTTPException(status_code=404, detail="Keyword not found in project")

        await db.delete(keyword)
        await db.commit()
        return
    except HTTPException:
        raise
    except Exception as e:
        logging.error("Failed to delete keyword: %s", e)
        raise HTTPException(status_code=500, detail="Failed to delete keyword")


# --- Запуск обновления позиций (парсер) ---

@router.post("/{project_id}/check")
async def run_position_check(project_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        project = await db.get(Project, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        logger.info(f"Запуск задачи parse_positions_task для проекта {project_id}")
        # Запуск задачи только для одного проекта
        parse_positions_by_project_task.delay(str(project_id))
        return {"message": f"Парсер запущен для проекта {project.domain}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to check project: %s", e)
        raise HTTPException(status_code=500, detail="Failed to check project")


# --- Получение позиций с фильтром по периоду ---
@router.get("/{project_id}/positions", response_model=List[PositionOut])
async def get_positions(
        project_id: UUID,
        period: Optional[str] = Query("week", regex="^(week|month|custom)$"),
        offset: int = Query(0, description="Сдвиг периода: 0 — текущий, -1 — предыдущий и т.д."),
        db: AsyncSession = Depends(get_db)
):
    try:
        now = datetime.utcnow()

        if period == "week":
            # Находим понедельник текущей недели
            current_weekday = now.weekday()  # 0 - понедельник, 6 - воскресенье
            # Начало текущей недели (понедельник)
            start_of_current_week = datetime(now.year, now.month, now.day) - timedelta(days=current_weekday)
            # Сдвигаем на offset недель
            start_date = start_of_current_week + timedelta(weeks=offset)
            end_date = start_date + timedelta(weeks=1)

        elif period == "month":
            # Начало текущего месяца
            start_of_current_month = datetime(now.year, now.month, 1)
            # Рассчитываем месяц с учётом offset
            month = (start_of_current_month.month - 1) + offset
            year = start_of_current_month.year + month // 12
            month = month % 12 + 1
            start_date = datetime(year, month, 1)
            # Начало следующего месяца
            if month == 12:
                end_date = datetime(year + 1, 1, 1)
            else:
                end_date = datetime(year, month + 1, 1)

        else:
            # Для произвольного периода можно вернуть все данные или добавить дополнительные параметры
            start_date = None
            end_date = None

        stmt = select(Position).join(Position.keyword).where(Keyword.project_id == project_id)

        if start_date and end_date:
            stmt = stmt.where(Position.checked_at >= start_date, Position.checked_at < end_date)

        stmt = stmt.options(selectinload(Position.keyword))

        result = await db.execute(stmt)
        positions = result.scalars().all()
        return positions
    except HTTPException:
        raise
    except Exception as e:
        logging.error("Failed to get positions by period: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get positions by period")


@router.get("/{project_id}/positions/intervals", response_model=List[KeywordIntervals])
async def get_positions_intervals(
        project_id: UUID,
        period: str = Query("month", regex="^(week|month|custom)$"),
        offset: int = Query(0, description="Сдвиг периода: 0 — текущий, -1 — предыдущий и т.д."),
        db: AsyncSession = Depends(get_db)
):
    try:
        current_utc_date = datetime.utcnow().date()

        # 1. Определяем границы периода (например, месяца)
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
            # Для custom — можно добавить параметры start_date и end_date
            period_display_start = None
            period_display_end = None

        # 2. Получаем проект и дату его создания
        project_result = await db.execute(select(Project).where(Project.id == project_id))
        project = project_result.scalar_one_or_none()
        if not project or not project.created_at:
            raise HTTPException(status_code=404, detail="Project not found or creation date missing.")
        project_start_date = project.created_at.date()

        # 3. Генерируем все 14-дневные интервалы от даты создания до конца отображаемого периода
        all_biweekly_intervals = []
        interval_start = project_start_date
        while interval_start <= period_display_end:
            interval_end = interval_start + timedelta(days=13)
            if interval_end > period_display_end:
                interval_end = period_display_end
            all_biweekly_intervals.append((interval_start, interval_end))
            interval_start += timedelta(days=14)

        # 4. Отбираем интервалы, пересекающиеся с отображаемым периодом
        relevant_intervals = []
        for start_dt, end_dt in all_biweekly_intervals:
            if period_display_start and period_display_end:
                # Добавляем условие, что интервал не проходит за текущую дату
                if start_dt <= period_display_end and end_dt >= period_display_start and end_dt <= current_utc_date:
                    display_start = max(start_dt, period_display_start)
                    display_end = min(end_dt, period_display_end)

                    relevant_intervals.append((start_dt, end_dt, display_start, display_end))
            else:
                if end_dt <= current_utc_date:
                    relevant_intervals.append((start_dt, end_dt, start_dt, end_dt))

        # 5. Получаем ключевые слова проекта
        keywords_result = await db.execute(
            select(Keyword).where(Keyword.project_id == project_id)
        )
        keywords = keywords_result.scalars().all()

        if not keywords:
            return []

        keyword_ids = [k.id for k in keywords]
        keywords_map = {k.id: k for k in keywords}

        # 6. Загружаем позиции для ключевых слов в расширенном диапазоне дат
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

        # 7. Создаем маппинг для быстрого доступа к позициям
        positions_map = {}
        for pos in positions:
            positions_map.setdefault(pos.keyword_id, {})[pos.checked_at.date()] = pos

        # 8. Считаем суммы по интервалам для каждого ключевого слова
        results = []

        keywords_map = {k.id: k for k in keywords}

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


# --- Экспорт в Excel ---


@router.get("/{project_id}/positions/export")
async def export_positions_excel(
        project_id: UUID,
        start_date: date = Query(..., description="Начальная дата периода"),
        end_date: date = Query(..., description="Конечная дата периода"),
        db: AsyncSession = Depends(get_db)
):
    try:
        if start_date > end_date:
            raise HTTPException(status_code=400, detail="start_date не может быть больше end_date")

        project = await db.get(Project, project_id)
        if not project:
            logger.error("Project not found")
            raise HTTPException(status_code=404, detail="Проект не найден")

        # Запрос позиций с загрузкой связанных ключевых слов и проектов
        stmt = (
            select(Position)
            .join(Position.keyword)
            .join(Keyword.project)
            .options(
                selectinload(Position.keyword).selectinload(Keyword.project)
            )
            .where(Project.id == project_id)
            .where(Position.checked_at >= datetime.combine(start_date, datetime.min.time()))
            .where(Position.checked_at <= datetime.combine(end_date, datetime.max.time()))
            .order_by(Position.checked_at)
        )

        result = await db.execute(stmt)
        positions = result.scalars().all()

        if not positions:
            logger.error("Positions not found")
            raise HTTPException(status_code=404, detail="Данные за указанный период не найдены")

        data = []
        for pos in positions:
            project = pos.keyword.project
            data.append({
                "Проект": project.domain,
                "Поисковая система": project.search_engine.value if project.search_engine else None,
                "Ключевое слово": pos.keyword.keyword,
                "Город": pos.keyword.region,
                "Дата": pos.checked_at.strftime("%Y-%m-%d"),
                "Позиция": pos.position,
                "Динамика": pos.previous_position,
                "Тренд": pos.trend.value if pos.trend else None,
                "Стоимость": pos.cost,
            })

        df = pd.DataFrame(data)

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name="Positions")

        output.seek(0)

        filename = f"positions_{project_id}_{start_date}_{end_date}.xlsx"

        headers = {
            'Content-Disposition': f'attachment; filename="{filename}"'
        }

        return StreamingResponse(
            output,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers=headers
        )
    except HTTPException:
        raise
    except Exception as e:
        logging.error("Failed to export positions excel: %s", e)
        raise HTTPException(status_code=500, detail="Failed to export positions excel")


# --- Клиентский просмотр ---

@router.get("/client/{client_link}", response_model=ClientProjectOut)
async def client_view(
        client_link: str,
        period: Optional[str] = Query("week", regex="^(week|month|custom)$"),
        db: AsyncSession = Depends(get_db)
):
    try:
        # Вычисляем дату начала периода для фильтрации позиций
        now = datetime.utcnow()
        if period == "week":
            start_date = now - timedelta(days=7)
        elif period == "month":
            start_date = now - timedelta(days=30)
        else:
            # Для произвольного периода можно принимать дополнительные параметры, например start_date и end_date
            start_date = None

        # Получаем проект по уникальной клиентской ссылке, вместе с ключевыми словами
        result = await db.execute(
            select(Project)
            .options(selectinload(Project.keywords).selectinload(Keyword.positions))
            .where(Project.client_link == client_link)
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Проект не найден")

        # Фильтруем позиции по периоду (если задан start_date)
        if start_date:
            for keyword in project.keywords:
                keyword.positions = [pos for pos in keyword.positions if pos.checked_at >= start_date]

        # Возвращаем проект с отфильтрованными позициями
        return project
    except HTTPException:
        raise
    except Exception as e:
        logging.error("Failed to get positions by client link: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get positions by client link")
