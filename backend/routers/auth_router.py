from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.security import OAuth2PasswordRequestForm

from database.models import User, UserRole
from database.db_init import get_db
from routers.schemas import PasswordChangeRequest, ManagerCreateRequest
from services.auth_utils import (verify_password, create_access_token,
                                 get_user_by_username,
                                 hash_password, get_current_user_for_password_change,
                                 get_current_active_admin)

router = APIRouter()


@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends(),
                db: AsyncSession = Depends(get_db)):
    user = await get_user_by_username(db, form_data.username)

    # Временная логика: если логин admin и пользователь не найден — создаём его
    # if form_data.username == "admin" and user is None:
    #     admin_user = User(
    #         username="admin",
    #         hashed_password=hash_password("admin"),
    #         role=UserRole.admin,
    #         is_temporary_password=True
    #     )
    #     db.add(admin_user)
    #     await db.commit()
    #     await db.refresh(admin_user)
    #     user = admin_user

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")

    access_token = create_access_token(data={"sub": user.username, "role": user.role.value})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "is_temporary_password": user.is_temporary_password
    }


@router.post("/change-password")
async def change_password(data: PasswordChangeRequest,
                          current_user: User = Depends(get_current_user_for_password_change),
                          db: AsyncSession = Depends(get_db)):
    if not verify_password(data.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Old password is incorrect")
    hashed_new = hash_password(data.new_password)
    current_user.hashed_password = hashed_new
    current_user.is_temporary_password = False
    db.add(current_user)
    await db.commit()
    return {"msg": "Password changed successfully"}


@router.post("/managers", status_code=201)
async def create_manager(data: ManagerCreateRequest,
                         current_admin: User = Depends(get_current_active_admin),
                         db: AsyncSession = Depends(get_db)):
    # Проверяем, что логин уникален
    existing_user = await get_user_by_username(db, data.username)
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")

    temp_password = data.temporary_password or data.username
    hashed_temp_password = hash_password(temp_password)

    new_manager = User(
        username=data.username,
        hashed_password=hashed_temp_password,
        role=UserRole.manager,
        is_temporary_password=True
    )
    db.add(new_manager)
    await db.commit()
    await db.refresh(new_manager)
    return {"msg": f"Manager '{new_manager.username}' created with temporary password."}
