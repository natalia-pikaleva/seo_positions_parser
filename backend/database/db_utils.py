from sqlalchemy.ext.asyncio import AsyncSession
from database.models import Project, Keyword, Position, Group, SearchEngineEnum, User
from sqlalchemy.future import select
from fastapi import HTTPException
from sqlalchemy.orm import selectinload


async def get_project_by_id(db: AsyncSession, project_id: str) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


# вспомогательная функция, чтобы получить пользователя с проектами
async def get_user_with_projects(db: AsyncSession, user_id: int) -> User:
    result = await db.execute(
        select(User).where(User.id == user_id).options(selectinload(User.projects))
    )
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
