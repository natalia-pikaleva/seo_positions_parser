from typing import List, Optional
from pydantic import BaseModel, Field, constr, ConfigDict
from uuid import UUID
from datetime import datetime, date
from enum import Enum


class ScheduleEnum(str, Enum):
    daily = "daily"
    weekly = "weekly"
    manual = "manual"


class SearchEngineEnum(str, Enum):
    yandex = "Яндекс"
    google = "Google"


class TrendEnum(str, Enum):
    up = "up"
    down = "down"
    stable = "stable"


# --- Keyword ---

class KeywordBase(BaseModel):
    keyword: constr(min_length=1)
    price_top_1_3: int = Field(0, ge=0)
    price_top_4_5: int = Field(0, ge=0)
    price_top_6_10: int = Field(0, ge=0)
    is_check: Optional[bool] = True


class KeywordCreate(KeywordBase):
    pass


class KeywordUpdate(BaseModel):
    keyword: Optional[constr(min_length=1)] = None
    is_check: Optional[bool] = None
    price_top_1_3: Optional[int] = Field(None, ge=0)
    price_top_4_5: Optional[int] = Field(None, ge=0)
    price_top_6_10: Optional[int] = Field(None, ge=0)
    group_id: Optional[UUID] = None

    class Config:
        orm_mode = True


class KeywordOut(KeywordUpdate):
    id: UUID
    currentPosition: Optional[int] = None
    previousPosition: Optional[int] = None
    lastChecked: Optional[datetime] = None
    cost: Optional[int] = 0
    trend: Optional[TrendEnum] = TrendEnum.stable

    class Config:
        orm_mode = True


# --- Group ---

class GroupBase(BaseModel):
    title: constr(min_length=1)
    region: constr(min_length=1)
    search_engine: SearchEngineEnum = Field(SearchEngineEnum.yandex, alias="searchEngine")
    topvisor_id: Optional[int] = None


class GroupCreate(GroupBase):
    project_id: UUID  # На какой проект относится группа


class GroupUpdate(BaseModel):
    title: Optional[constr(min_length=1)] = None
    region: Optional[constr(min_length=1)] = None
    search_engine: Optional[SearchEngineEnum] = Field(None, alias="searchEngine")
    topvisor_id: Optional[int] = None
    project_id: Optional[UUID] = None

    class Config:
        allow_population_by_field_name = True
        orm_mode = True


class GroupOut(GroupBase):
    id: UUID
    keywords: List[KeywordOut] = []

    class Config:
        allow_population_by_field_name = True
        orm_mode = True


# --- Position ---

class PositionOut(BaseModel):
    id: UUID
    keyword_id: UUID
    checked_at: datetime
    position: Optional[int] = None
    frequency: Optional[int] = None
    previous_position: Optional[int] = None
    cost: int
    trend: TrendEnum

    class Config:
        orm_mode = True


class IntervalSumOut(BaseModel):
    start_date: date  # Начало полного интервала (для подсчёта суммы)
    end_date: date  # Конец полного интервала (для подсчёта суммы)
    display_start_date: date  # Начало интервала для отображения (обрезанный)
    display_end_date: date  # Конец интервала для отображения
    sum_cost: float  # Сумма по полному интервалу

    days_top3: int = 0
    cost_top3: int = 0
    days_top5: int = 0
    cost_top5: int = 0
    days_top10: int = 0
    cost_top10: int = 0


class KeywordIntervals(BaseModel):
    keyword_id: UUID
    intervals: List[IntervalSumOut]


# --- Project ---

class ProjectBase(BaseModel):
    domain: constr(min_length=1)

    class Config:
        allow_population_by_field_name = True
        orm_mode = True


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    domain: Optional[constr(min_length=1)] = None
    groups: Optional[List[GroupUpdate]] = None

    class Config:
        allow_population_by_field_name = True
        orm_mode = True


class ProjectOut(ProjectBase):
    id: UUID
    created_at: datetime = Field(..., alias="createdAt")
    client_link: str = Field(..., alias="clientLink")
    groups: Optional[List[GroupOut]] = None

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True
    )


# --- Client View ---

class ClientProjectOut(BaseModel):
    id: UUID
    created_at: datetime = Field(..., alias="createdAt")
    domain: str
    groups: List[GroupOut]

    model_config = ConfigDict(
        from_attributes=True,  # Включает поддержку ORM-объектов
        populate_by_name=True  # Позволяет использовать alias при валидации и сериализации
    )


# --- Дополнительные схемы ---

class FilterOptions(BaseModel):
    period: str  # 'week', 'month', 'custom' и т.п.


# --- Auth ---

class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str


# --- Users ---

class UserRole(str, Enum):
    admin = "admin"
    employee = "manager"

class ManagerCreateRequest(BaseModel):
    username: str
    temporary_password: Optional[str] = None
    fullname: Optional[str] = None
    role: UserRole


class UpdateFullnameRequest(BaseModel):
    fullname: str


class UpdateRoleRequest(BaseModel):
    role: str  # ожидается строка из enum UserRole


class AssignProjectRequest(BaseModel):
    project_id: str  # UUID в строковом виде


class UserUpdateRequest(BaseModel):
    fullname: Optional[str] = None
    role: Optional[str] = None  # стоит проверять в enum
    project_ids: Optional[List[str]] = None  # Список UUID проектов для


class ProjectOutForUser(BaseModel):
    id: UUID
    domain: constr(min_length=1)
    created_at: datetime = Field(..., alias="createdAt")
    client_link: str = Field(..., alias="clientLink")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True
    )


class UserOut(BaseModel):
    id: int
    username: str
    fullname: Optional[str]
    role: str
    projects: Optional[List[ProjectOutForUser]] = []

    model_config = ConfigDict(
        from_attributes=True,
    )
