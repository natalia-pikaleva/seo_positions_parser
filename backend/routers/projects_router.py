from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from fastapi.responses import StreamingResponse
import io
import pandas as pd
from datetime import datetime, timedelta, date
import logging

from database.db_init import get_db
from database.models import Project, Keyword, Position
from routers.schemas import ProjectCreate, ProjectUpdate, KeywordUpdate, ProjectOut, ClientProjectOut, \
    PositionOut, KeywordCreate, KeywordUpdate, KeywordOut, IntervalSumOut, KeywordIntervals
from services.task import parse_positions_task
from services.api_utils import generate_client_link

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Проекты ---

@router.get("/", response_model=List[ProjectOut])
async def get_projects(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(Project).options(selectinload(Project.keywords))
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
            keyword = Keyword(**kw_in.dict())
            project.keywords.append(keyword)

        db.add(project)
        await db.commit()
        # Обновляем объект, чтобы получить id и другие поля
        await db.refresh(project)

        # Жестко загружаем связанные keywords, чтобы избежать ошибки MissingGreenlet
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
        # parse_positions_task.delay(str(project_id))
        return {"message": "Парсер запущен через Celery"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error("Failed to check project: %s", e)
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
        db: AsyncSession = Depends(get_db)  # Функция для получения сессии базы данных
):
    try:
        current_utc_date = datetime.utcnow().date()  # Текущая дата UTC без времени

        # 1. Определяем границы запрошенного периода (например, месяца)
        # Эти границы используются для фильтрации ИНТЕРВАЛОВ, которые будут возвращены клиенту
        if period == "month":
            # Расчет первого дня месяца с учетом offset
            target_month_date = datetime(current_utc_date.year, current_utc_date.month, 1) + timedelta(
                days=30 * offset)  # Грубый сдвиг для начальной точки
            # Корректный расчет первого дня месяца с учетом offset
            target_month_first_day = datetime(target_month_date.year, target_month_date.month, 1)

            # Пересчитываем target_month_first_day с учетом offset, чтобы попасть в нужный месяц
            # Это более точный способ, чем просто +30*offset
            year = current_utc_date.year
            month = current_utc_date.month + offset
            while month > 12:
                month -= 12
                year += 1
            while month < 1:
                month += 12
                year -= 1

            period_display_start = datetime(year, month, 1).date()
            # Расчет последнего дня месяца
            period_display_end = (datetime(year, month + 1, 1) - timedelta(days=1)).date() if month < 12 else (
                    datetime(year + 1, 1, 1) - timedelta(days=1)).date()

        elif period == "week":
            # Расчет понедельника текущей недели с учетом offset
            monday = current_utc_date - timedelta(days=current_utc_date.weekday())  # Понедельник текущей недели
            period_display_start = monday + timedelta(weeks=offset)
            period_display_end = period_display_start + timedelta(days=6)  # Воскресенье текущей недели
        else:  # 'custom' или любой другой случай, если у вас будет
            # Для custom периода, вероятно, нужны будут start_date и end_date из запроса
            # Для простоты, пока вернем все интервалы
            period_display_start = None
            period_display_end = None

        # 2. Получаем дату создания проекта
        project_query = select(Project).where(Project.id == project_id)
        project_result = await db.execute(project_query)
        project = project_result.scalar_one_or_none()

        if not project or not project.createdAt:
            raise HTTPException(status_code=404, detail="Project not found or creation date missing.")

        project_start_date = project.createdAt.date()  # Используем только дату

        # 3. Генерируем ВСЕ 14-дневные интервалы от даты создания проекта до текущей даты
        # Это важно, чтобы учесть все позиции, даже те, что в "старых" интервалах
        all_biweekly_intervals = []
        interval_start = project_start_date
        # Генерируем интервалы до текущей даты (или чуть дальше, чтобы захватить последний неполный)
        while interval_start <= current_utc_date + timedelta(days=14):  # Несколько дней запаса
            interval_end = interval_start + timedelta(days=13)
            all_biweekly_intervals.append((interval_start, interval_end))
            interval_start += timedelta(days=14)

        # 4. Фильтруем сгенерированные интервалы, чтобы вернуть только те, которые
        # пересекаются с ОТОБРАЖАЕМЫМ периодом (period_display_start/end).
        # Но суммы будем считать по полному 14-дневному интервалу.
        relevant_intervals_for_display = []
        for start_dt, end_dt in all_biweekly_intervals:
            # Проверяем пересечение интервала с отображаемым периодом
            if period_display_start and period_display_end:
                if (start_dt <= period_display_end and end_dt >= period_display_start):
                    relevant_intervals_for_display.append((start_dt, end_dt))
            else:  # Если period_display_start/end не определены (например, для custom)
                relevant_intervals_for_display.append((start_dt, end_dt))

        # Сортируем интервалы по дате начала
        relevant_intervals_for_display.sort(key=lambda x: x[0])

        # 5. Получаем все ключевые слова для данного проекта
        keywords_query = select(Keyword.id).where(Keyword.project_id == project_id)
        keywords_result = await db.execute(keywords_query)
        keyword_ids = [k_id for (k_id,) in keywords_result.all()]  # Получаем список UUID

        # 6. Загружаем ВСЕ позиции для этих ключевых слов, чтобы избежать множественных запросов
        # и иметь данные для всех интервалов.
        # Ограничим по дате максимального интервала, чтобы не тащить совсем старые данные
        max_relevant_date = max(
            i[1] for i in relevant_intervals_for_display) if relevant_intervals_for_display else current_utc_date
        min_relevant_date = min(
            i[0] for i in relevant_intervals_for_display) if relevant_intervals_for_display else project_start_date

        # Расширяем диапазон для загрузки позиций, чтобы захватить данные для интервалов,
        # которые начинаются раньше period_display_start, но заканчиваются в нём.
        # Например, интервал 25.06-08.07 для июля месяца.
        # Берем 14 дней до начала самого раннего отображаемого интервала.
        fetch_positions_start_date = min_relevant_date - timedelta(days=14)

        all_positions_query = select(Position).where(
            Position.keyword_id.in_(keyword_ids),
            Position.checked_at >= fetch_positions_start_date,
            Position.checked_at <= max_relevant_date + timedelta(days=1)
            # +1 день, чтобы захватить позиции до конца дня
        )
        all_positions_result = await db.execute(all_positions_query)
        all_positions = all_positions_result.scalars().all()

        # Создаем маппинг для быстрого доступа к позициям
        # { keyword_id: { date_str: Position } }
        positions_by_keyword_and_date = {}
        for pos in all_positions:
            if pos.keyword_id not in positions_by_keyword_and_date:
                positions_by_keyword_and_date[pos.keyword_id] = {}
            # Приводим checked_at к date, чтобы совпало с interval_start/end
            positions_by_keyword_and_date[pos.keyword_id][pos.checked_at.date()] = pos

        final_results: List[KeywordIntervals] = []

        # 7. Для каждого ключевого слова считаем сумму по каждому релевантному интервалу
        for k_id in keyword_ids:
            keyword_intervals_data: List[IntervalSumOut] = []
            for int_start_dt, int_end_dt in relevant_intervals_for_display:
                current_sum = 0.0
                current_date = int_start_dt
                while current_date <= int_end_dt:
                    position = positions_by_keyword_and_date.get(k_id, {}).get(current_date)
                    if position and position.cost is not None:
                        current_sum += position.cost
                    current_date += timedelta(days=1)

                keyword_intervals_data.append(
                    IntervalSumOut(
                        start_date=int_start_dt,
                        end_date=int_end_dt,
                        sum_cost=current_sum
                    )
                )
            final_results.append(
                KeywordIntervals(
                    keyword_id=k_id,
                    intervals=keyword_intervals_data
                )
            )

        return final_results

    except HTTPException:
        raise  # Пробрасываем HTTPExceptions без изменений
    except Exception as e:
        logging.error(f"Failed to get positions intervals: {e}", exc_info=True)  # exc_info=True для полного стека
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


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
