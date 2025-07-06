from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from database.db_init import get_db
from database.models import Project, Keyword, Position
from routers.schemas import ProjectCreate, ProjectUpdate, KeywordUpdate, ProjectOut, ClientProjectOut, \
    PositionOut, KeywordCreate, KeywordUpdate, KeywordOut
from services.task import parse_positions_task
from services.api_utils import generate_client_link
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Проекты ---

@router.get("/", response_model=List[ProjectOut])
async def get_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).options(selectinload(Project.keywords))
    )
    projects = result.scalars().all()
    return projects


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
    except Exception as e:
        logging.error("Failed to create project: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to create project: {str(e)}")


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.keywords))  # жёсткая загрузка ключевых слов
        .where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(project_id: UUID, project_in: ProjectUpdate, db: AsyncSession = Depends(get_db)):
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


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: UUID, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(project)
    await db.commit()
    return


# --- Ключевые слова и позиции ---


@router.get("/{project_id}/keywords", response_model=List[KeywordOut])
async def get_keywords(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Keyword).where(Keyword.project_id == project_id))
    keywords = result.scalars().all()
    return keywords


@router.post("/{project_id}/keywords", response_model=KeywordOut)
async def create_keyword(
        project_id: UUID,
        keyword_in: KeywordCreate,
        db: AsyncSession = Depends(get_db)
):
    # Проверяем, что проект существует
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # Создаём новое ключевое слово
    new_keyword = Keyword(
        project_id=project_id,
        keyword=keyword_in.keyword,
        price_top_1_3=keyword_in.price_top_1_3,
        price_top_4_5=keyword_in.price_top_4_5,
        price_top_6_10=keyword_in.price_top_6_10,
    )
    db.add(new_keyword)
    await db.commit()
    await db.refresh(new_keyword)

    return new_keyword


@router.put("/{project_id}/keywords/{keyword_id}", response_model=KeywordOut)
async def update_keyword(
        project_id: UUID,
        keyword_id: UUID,
        keyword_in: KeywordUpdate = Depends(),
        db: AsyncSession = Depends(get_db)
):
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


@router.delete("/{project_id}/keywords/{keyword_id}", status_code=204)
async def delete_keyword(
        project_id: UUID,
        keyword_id: UUID,
        db: AsyncSession = Depends(get_db)
):
    # Проверяем, что ключевое слово существует и принадлежит проекту
    keyword = await db.get(Keyword, keyword_id)
    if not keyword or keyword.project_id != project_id:
        raise HTTPException(status_code=404, detail="Keyword not found in project")

    await db.delete(keyword)
    await db.commit()
    return


# --- Запуск обновления позиций (парсер) ---

@router.post("/{project_id}/check")
async def run_position_check(project_id: UUID, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    logger.info(f"Запуск задачи parse_positions_task для проекта {project_id}")
    # parse_positions_task.delay(str(project_id))
    return {"message": "Парсер запущен через Celery"}


# --- Получение позиций с фильтром по периоду ---


@router.get("/{project_id}/positions", response_model=List[PositionOut])
async def get_positions(
        project_id: UUID,
        period: Optional[str] = Query("week", regex="^(week|month|custom)$"),
        offset: int = Query(0, description="Сдвиг периода: 0 — текущий, -1 — предыдущий и т.д."),
        db: AsyncSession = Depends(get_db)
):
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


# --- Экспорт в Excel ---

@router.get("/{project_id}/export")
async def export_excel(project_id: UUID, period: Optional[str] = Query("week")):
    # Логика генерации Excel-файла с позициями за период
    # Возвращать StreamingResponse с файлом
    pass


# --- Клиентский просмотр ---

@router.get("/client/{client_link}", response_model=ClientProjectOut)
async def client_view(
        client_link: str,
        period: Optional[str] = Query("week", regex="^(week|month|custom)$"),
        db: AsyncSession = Depends(get_db)
):
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
