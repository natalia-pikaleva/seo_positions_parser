from fastapi import (FastAPI, Request, Depends, UploadFile, File,
                     Form, status)
from fastapi.middleware.cors import CORSMiddleware

from database.db_init import get_db, create_tables
from routers.projects_router import router as projects_router
from routers.groups_router import router as groups_router
from routers.users_router import router as users_router

from routers.auth_router import router as auth_router
from routers.task_status_router import router as task_status_router
from database.models import Keyword, Project, Group, SearchEngineEnum
from services.topvizor_utils import (import_keywords, add_searcher_region,
                                     get_region_key_index_static, add_searcher_to_project,
                                     create_project_in_topvisor)
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
import aiohttp
import logging
import asyncio
from uuid import uuid4

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)

app = FastAPI(title="SEO Position parser")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://31.207.75.202:5173",
    "https://parser.re-spond.com",
    "http://parser.re-spond.com"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router, prefix="/api/projects", tags=["projects"])
app.include_router(groups_router, prefix="/api/groups", tags=["groups"])
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(task_status_router, prefix="/api/task-status", tags=["tasks"])
app.include_router(users_router, prefix="/api/users", tags=["users"])


# Создание таблиц (запускайте один раз)
@app.on_event("startup")
async def startup():
    await create_tables()


from sqlalchemy import or_


async def create_new_group_for_all_projects(db: AsyncSession):
    try:
        # Получаем все проекты с группами и ключами
        result = await db.execute(
            select(Project)
            .options(
                selectinload(Project.groups).selectinload(Group.keywords)
            )
        )
        projects = result.scalars().all()

        async with aiohttp.ClientSession() as session_http:
            for project in projects:
                domain = project.domain

                # Проверяем создание новой группы
                existing_group = next((g for g in project.groups if g.title == "Новая группа"), None)
                if existing_group:
                    logging.info(f"Проект {domain} уже содержит группу 'Новая группа', пропускаем")
                    continue

                region = "Москва" if domain != "okna-grandhouse.ru" else "Санкт-Петербург"

                # Создаем новую группу
                new_group = Group(
                    id=uuid4(),
                    title="Новая группа",
                    region=region,
                    search_engine=SearchEngineEnum.yandex,
                    project_id=project.id,
                    topvisor_id=None
                )
                project.groups.append(new_group)
                await db.flush()  # Чтобы new_group.id гарантированно был доступен

                # Получаем ключи, которые принадлежат проекту напрямую (старые)
                # Предположим, что в модели Keyword есть project_id которую вы пока не удалили
                # Если в модели нет, то нужно получить ключи с group_id == None и project_id == project.id
                old_keywords_result = await db.execute(
                    select(Keyword)
                    .where(
                        (Keyword.group_id == None) & (Keyword.project_id == project.id)
                    )
                )
                old_keywords = old_keywords_result.scalars().all()

                # А также ключи из групп проекта (если хотите объединить)
                group_keywords = []
                for g in project.groups:
                    # исключим новую группу, она ещё без ключей
                    if g.id != new_group.id:
                        group_keywords.extend(g.keywords)

                all_keywords = old_keywords + group_keywords

                # Обновляем ключам group_id на new_group.id
                for kw in old_keywords:
                    kw.group_id = new_group.id
                    # Если хотите - можете удалить у ключа project_id или оставить на данный момент

                # Подготавливаем список ключевых слов для загрузки в Topvisor
                keywords_list = [kw.keyword for kw in all_keywords if kw.keyword]

                # Создаем проект в Topvisor для группы
                topvisor_project_name = f"{domain} : Новая группа"
                topvisor_group_id = await create_project_in_topvisor(session_http, url=domain,
                                                                     name=topvisor_project_name)
                if not topvisor_group_id:
                    logging.error(
                        f"Не удалось создать проект в Topvisor для группы '{new_group.title}' в проекте {domain}")
                    raise RuntimeError(f"Ошибка создания проекта в Topvisor для группы '{new_group.title}'")

                new_group.topvisor_id = int(topvisor_group_id)

                # Добавляем поисковую систему
                searcher_key = 0
                searcher_resp = await add_searcher_to_project(session_http, new_group.topvisor_id, searcher_key)
                if not searcher_resp:
                    logging.error(f"Ошибка добавления поисковой системы в Topvisor для группы '{new_group.title}'")
                    raise RuntimeError(f"Ошибка добавления поисковой системы")

                # Добавляем регион
                region_key_index = get_region_key_index_static(new_group.region)
                if not region_key_index:
                    logging.error(f"Регион '{new_group.region}' не найден для группы '{new_group.title}'")
                    raise RuntimeError(f"Регион не найден")
                region_key, _ = region_key_index

                region_resp = await add_searcher_region(session_http, new_group.topvisor_id, searcher_key, region_key,
                                                        region_lang="ru")
                if not region_resp:
                    logging.error(f"Ошибка добавления региона в Topvisor для группы '{new_group.title}'")
                    raise RuntimeError(f"Ошибка добавления региона")

                if not keywords_list:
                    logging.info(f"В проекте {domain} нет ключей для переноса")
                else:
                    import_resp = await import_keywords(session_http, new_group.topvisor_id, keywords_list)
                    if import_resp is None or import_resp.get("errors"):
                        logging.error(
                            f"Ошибка импорта ключей в Topvisor для группы '{new_group.title}' в проекте {domain}")
                        raise RuntimeError("Ошибка импорта ключей")

                await db.flush()

                logging.info(f"Новая группа 'Новая группа' успешно создана в проекте {domain} с переносом ключей")

            await db.commit()

    except Exception as e:
        logging.error(f"Ошибка при создании групп для всех проектов: {e}", exc_info=True)
        raise


@app.get("/api/")
async def api_root(db: AsyncSession = Depends(get_db)):
    return {"message": "ОК"}
