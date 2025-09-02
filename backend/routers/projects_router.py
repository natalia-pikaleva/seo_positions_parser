from fastapi import APIRouter, HTTPException, Depends, Query, status
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

from database.db_init import get_db, SyncSessionLocal
from database.models import Project, Keyword, Position, Group, SearchEngineEnum, User, UserRole
from routers.schemas import (ProjectCreate, ProjectUpdate, KeywordUpdate,
                             ProjectOut, ClientProjectOut, PositionOut,
                             KeywordCreate, KeywordUpdate, KeywordOut,
                             IntervalSumOut, KeywordIntervals, GroupOut,
                             GroupCreate, GroupUpdate)

from services.api_utils import generate_client_link
from services.auth_utils import get_current_user
from services.topvizor_task import run_main_task_one_project
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

# --- Проекты ---

from fastapi import Depends, HTTPException, status
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload


@router.get("/", response_model=List[ProjectOut])
async def get_projects(
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    try:
        logger.info(f"User role: {current_user.role}")
        if current_user.role == UserRole.admin:
            # Админ видит все проекты
            result = await db.execute(
                select(Project).options(selectinload(Project.groups))
            )
            projects = result.scalars().all()
            return projects

        elif current_user.role == UserRole.manager:
            # Менеджер видит только свои проекты
            # Подгружаем проекты с группами
            await db.refresh(current_user, ['projects'])  # загружаем связанные проекты
            # Подгружаем группы проектов менеджера
            for project in current_user.projects:
                await db.refresh(project, ['groups'])
            return current_user.projects

        else:
            raise HTTPException(status_code=403, detail="Access denied")
    except Exception as e:
        logging.error("Failed to get projects: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get projects")


@router.post("/", response_model=ProjectOut, status_code=201)
async def create_project(project_in: ProjectCreate,
                         db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    try:
        project_data = project_in.dict(exclude={"groups"}, by_alias=False)

        if not project_data.get("client_link"):
            project_data["client_link"] = generate_client_link()
        if not project_data.get("created_at"):
            project_data["created_at"] = datetime.utcnow()

        project = Project(**project_data)
        db.add(project)
        await db.commit()
        await db.refresh(project)

        if current_user.role != UserRole.admin:
            # Привязываем проект к менеджеру
            current_user.projects.append(project)
            db.add(current_user)
            await db.commit()
            await db.refresh(current_user)

            # Повторно загружаем проект с группами и ключевыми словами
        result = await db.execute(
            select(Project)
            .options(selectinload(Project.groups).selectinload(Group.keywords))
            .where(Project.id == project.id)
        )
        project_with_relations = result.scalar_one()

        return project_with_relations

    except Exception as e:
        logging.error(f"Ошибка при создании проекта: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create project")


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(Project)
            .options(
                selectinload(Project.groups).selectinload(Group.keywords),
            )
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
async def update_project(
        project_id: UUID,
        project_in: ProjectUpdate,
        db: AsyncSession = Depends(get_db)
):
    try:
        # Загружаем проект с группами и ключами
        result = await db.execute(
            select(Project)
            .options(selectinload(Project.groups).selectinload(Group.keywords))
            .where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        update_data = project_in.dict(exclude_unset=True, by_alias=False)

        domain_changed = "domain" in update_data and update_data["domain"] != project.domain
        new_domain = update_data.get("domain")

        async with aiohttp.ClientSession() as session_http:
            if domain_changed:
                # Удаляем все подпроекты и создаём заново
                for group in project.groups:
                    if group.topvisor_id:
                        try:
                            await delete_project_topvisor(group.topvisor_id)
                        except Exception as e:
                            logging.warning(f"Не удалось удалить проект Topvisor (group {group.title}): {e}")

                # Создаем новые проекты групп в Topvisor с новым domain
                for group in project.groups:
                    topvisor_project_name = f"{new_domain} - {group.title}"
                    topvisor_group_id = await create_project_in_topvisor(session_http, url=new_domain,
                                                                         name=topvisor_project_name)
                    if not topvisor_group_id:
                        logging.error(
                            f"Не удалось создать проект в Topvisor для группы {group.title} после обновления домена")
                        raise HTTPException(status_code=500,
                                            detail=f"Ошибка создания проекта в Topvisor для группы {group.title} после обновления домена")

                    # Обновляем topvisor_id
                    group.topvisor_id = int(topvisor_group_id)

                    # Добавляем поисковую систему для проекта
                    searcher_key = 0 if group.search_engine == SearchEngineEnum.yandex else 1
                    searcher_result = await add_searcher_to_project(session_http, group.topvisor_id, searcher_key)
                    if searcher_result is None:
                        logging.error(f"Не удалось добавить поисковую систему в Topvisor для группы {group.title}")
                        raise HTTPException(status_code=500,
                                            detail=f"Ошибка добавления поисковой системы в Topvisor для группы {group.title}")

                    # Получаем ключ региона
                    region_key, _ = await get_region_key_index_static(group.region)
                    if region_key is None:
                        logging.error(f"Не удалось получить регион для группы {group.title}")
                        raise HTTPException(status_code=500,
                                            detail=f"Некорректный регион для группы {group.title}")

                    # Добавляем регион
                    region_result = await add_searcher_region(session_http, group.topvisor_id, searcher_key, region_key)
                    if region_result is None:
                        logging.error(f"Не удалось добавить регион в Topvisor для группы {group.title}")
                        raise HTTPException(status_code=500,
                                            detail=f"Ошибка добавления региона в Topvisor для группы {group.title}")

                    # Импортируем ключевые слова
                    keywords_list = [kw.keyword for kw in group.keywords if kw.keyword]
                    if keywords_list:
                        import_response = await import_keywords(session_http, group.topvisor_id, keywords_list)
                        if import_response is None or import_response.get("errors"):
                            logging.error(f"Ошибка импорта ключей в Topvisor для группы {group.title}")
                            raise HTTPException(status_code=500,
                                                detail=f"Ошибка импорта ключей в Topvisor для группы {group.title}")

                # Обновляем домен локально
                project.domain = new_domain

            else:
                # Если домен не меняется, можно обновить имя проекта в топвизоре
                if "domain" in update_data and project.topvisor_id:
                    try:
                        await update_project_topvisor(project.topvisor_id, {"name": update_data["domain"]})
                    except Exception as e:
                        logging.error(f"Ошибка обновления имени проекта в Topvisor: {e}")
                        raise HTTPException(status_code=500, detail="Failed to update project in Topvisor")

                # Просто обновляем локальные поля, кроме групп
                if "domain" in update_data:
                    project.domain = update_data["domain"]

            # Обновляем другие поля, например schedule
            if "schedule" in update_data:
                project.schedule = update_data["schedule"]

            await db.commit()
            await db.refresh(project)
            return project

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to update project: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update project")


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
        project_id: UUID,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Удалить проект может только администратор")

    try:
        # Загружаем проект вместе с группами (чтобы получить topvisor_id подпроектов)
        result = await db.execute(
            select(Project).options(selectinload(Project.groups)).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Удаляем все подпроекты (группы) из Topvisor по их topvisor_id
        for group in project.groups:
            if group.topvisor_id:
                try:
                    await delete_project_topvisor(group.topvisor_id)
                except Exception as e:
                    logging.error(
                        f"Не удалось удалить подпроект Topvisor с ID {group.topvisor_id} (группа {group.title}): {e}")
                    # Можно решить, стоит ли прерывать или логировать и идти дальше
                    raise HTTPException(status_code=500,
                                        detail=f"Ошибка удаления подпроекта Topvisor для группы {group.title}")

        # Удаляем сам проект (если у вас есть topvisor_id для главного проекта, можно удалить и его)
        if project.topvisor_id:
            try:
                await delete_project_topvisor(project.topvisor_id)
            except Exception as e:
                logging.error(f"Не удалось удалить проект Topvisor с ID {project.topvisor_id}: {e}")
                raise HTTPException(status_code=500, detail="Ошибка удаления проекта Topvisor")

        # Удаляем проект из базы
        await db.delete(project)
        await db.commit()
        return
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to delete project: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete project")


# --- Запуск обновления позиций (парсер) ---


@router.post("/{project_id}/check")
async def run_position_check(project_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        # project = await db.get(Project, project_id)
        # if not project:
        #     raise HTTPException(status_code=404, detail="Project not found")

        # Запускаем фоновую задачу через Celery
        run_main_task_one_project.delay(str(project_id))
        return {"message": f"Парсер запущен для проекта {project.domain}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to check project: {e}")
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
            logging.error("Project not found")
            raise HTTPException(status_code=404, detail="Проект не найден")

        # Запрос позиций с join и фильтрацией по project_id через Group и Keyword
        stmt = (
            select(Position)
            .join(Position.keyword)
            .join(Keyword.group)
            .where(Keyword.group.has(Group.project_id == project_id))
            .where(Position.checked_at >= datetime.combine(start_date, datetime.min.time()))
            .where(Position.checked_at <= datetime.combine(end_date, datetime.max.time()))
            .options(
                selectinload(Position.keyword).selectinload(Keyword.group).selectinload(Group.project)
            )
            .order_by(Position.checked_at)
        )

        result = await db.execute(stmt)
        positions = result.scalars().all()

        if not positions:
            logging.error("Positions not found")
            raise HTTPException(status_code=404, detail="Данные за указанный период не найдены")

        data = []
        for pos in positions:
            project = pos.keyword.group.project
            group = pos.keyword.group
            keyword = pos.keyword
            data.append({
                "Проект": project.domain if project else None,
                "Поисковая система": group.search_engine.value if group and group.search_engine else None,
                "Группа": group.title if group else None,
                "Ключевое слово": keyword.keyword,
                "Город": group.region if group else None,
                "Дата": pos.checked_at.strftime("%Y-%m-%d"),
                "Позиция": pos.position,
                "Частотность": pos.frequency,
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
        logging.error(f"Failed to export positions excel: {e}", exc_info=True)
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
            .options(
                selectinload(Project.groups)  # подгружаем группы проекта
                .selectinload(Group.keywords)  # у групп подгружаем ключевые слова
                .selectinload(Keyword.positions)  # у ключевых слов подгружаем позиции
            )
            .where(Project.client_link == client_link)
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Проект не найден")

        # Фильтруем позиции по периоду (если задан start_date)
        if start_date:
            for group in project.groups:
                for keyword in group.keywords:
                    if hasattr(keyword, 'positions') and keyword.positions is not None:
                        keyword.positions = [
                            pos for pos in keyword.positions if pos.checked_at >= start_date
                        ]

        # Возвращаем проект с отфильтрованными позициями
        return project
    except HTTPException:
        raise
    except Exception as e:
        logging.error("Failed to get positions by client link: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get positions by client link")
