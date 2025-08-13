from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
import logging
from sqlalchemy.orm import selectinload
from sqlalchemy.future import select
from typing import List

from database.models import User, UserRole
from database.db_init import get_db
from database.db_utils import get_project_by_id, get_user_with_projects

from routers.schemas import UpdateFullnameRequest, ManagerCreateRequest, UpdateRoleRequest, AssignProjectRequest, \
    UserUpdateRequest, UserOut
from services.auth_utils import (verify_password, create_access_token,
                                 get_user_by_username,
                                 hash_password, get_current_user_for_password_change,
                                 get_current_active_admin, get_user_by_id, generate_temporary_password)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.patch("/{user_id}/update")
async def update_user(user_id: int,
                      data: UserUpdateRequest,
                      current_admin: User = Depends(get_current_active_admin),
                      db: AsyncSession = Depends(get_db)):
    try:
        user = await get_user_with_projects(db, user_id)

        updated = False  # флаг для проверки, что хоть что-то обновлено

        # Обновление fullname
        if data.fullname is not None:
            user.fullname = data.fullname
            updated = True

        # Обновление role с проверкой в enum
        if data.role is not None:
            try:
                user.role = UserRole(data.role)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid role")
            updated = True

        # Обновление проектов, если передан список project_ids
        if data.project_ids is not None:
            # Загрузка проектов по id из базы
            projects = []
            for pid in data.project_ids:
                project = await get_project_by_id(db, pid)
                projects.append(project)
            # Заменяем список проектов у пользователя
            user.projects = projects
            updated = True

        if updated:
            db.add(user)
            await db.commit()
            await db.refresh(user)  # чтобы обновить связи
        else:
            raise HTTPException(status_code=400, detail="No fields to update")

        result = await db.execute(
            select(User)
            .where(User.id == user.id)
            .options(selectinload(User.projects))
        )
        user = result.scalars().first()

        # Формируем ответ с полной информацией о пользователе + проекты
        return {
            "id": user.id,
            "username": user.username,
            "fullname": user.fullname,
            "role": user.role.value,
            "projects": [{"id": str(p.id), "domain": p.domain} for p in user.projects]
        }
    except Exception as e:
        logging.error("Failed to update user: %s", e)
        raise HTTPException(status_code=500, detail="Failed to update user")


@router.delete("/{user_id}")
async def delete_user(user_id: int,
                      current_admin: User = Depends(get_current_active_admin),
                      db: AsyncSession = Depends(get_db)):
    try:
        user = await get_user_by_id(db, user_id)
        await db.delete(user)
        await db.commit()
        return {"msg": f"User {user.username} deleted"}
    except Exception as e:
        logging.error("Failed to delete user: %s", e)
        raise HTTPException(status_code=500, detail="Failed to delete user")


@router.post("/{user_id}/reset-temporary-password")
async def reset_temporary_password(user_id: int,
                                   current_admin: User = Depends(get_current_active_admin),
                                   db: AsyncSession = Depends(get_db)):
    try:
        user = await get_user_by_id(db, user_id)
        # Генерируем случайный безопасный временный пароль
        temp_password = generate_temporary_password(6)
        hashed_temp_password = hash_password(temp_password)
        user.hashed_password = hashed_temp_password
        user.is_temporary_password = True
        db.add(user)
        await db.commit()
        return {"msg": f"Temporary password has been set for user {user.username}", "temp_password": temp_password}
    except Exception as e:
        logging.error("Failed to reset password: %s", e)
        raise HTTPException(status_code=500, detail="Failed to reset password")


@router.get("/", response_model=List[UserOut])
async def get_users_with_projects(
        current_admin: User = Depends(get_current_active_admin),
        db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(
            select(User).options(selectinload(User.projects)).order_by(User.username)
        )
        users = result.scalars().all()
        return users
    except Exception as e:
        logging.error("Failed to get users: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get users")
