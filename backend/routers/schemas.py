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
    region: str
    price_top_1_3: int = Field(0, ge=0)
    price_top_4_5: int = Field(0, ge=0)
    price_top_6_10: int = Field(0, ge=0)


class KeywordCreate(KeywordBase):
    pass


class KeywordUpdate(BaseModel):
    keyword: Optional[constr(min_length=1)] = None
    region: Optional[str] = None
    price_top_1_3: Optional[int] = Field(None, ge=0)
    price_top_4_5: Optional[int] = Field(None, ge=0)
    price_top_6_10: Optional[int] = Field(None, ge=0)

    class Config:
        orm_mode = True


class KeywordOut(KeywordUpdate):
    id: UUID
    region: str
    currentPosition: Optional[int] = None
    previousPosition: Optional[int] = None
    lastChecked: Optional[datetime] = None
    cost: Optional[int] = 0
    trend: Optional[TrendEnum] = TrendEnum.stable


# --- Position ---

class PositionOut(BaseModel):
    id: UUID
    keyword_id: UUID
    checked_at: datetime
    position: Optional[int] = None
    previous_position: Optional[int] = None
    cost: int
    trend: TrendEnum

class IntervalSumOut(BaseModel):
    start_date: date  # Используем date, так как на фронтенде удобно работать с датами без времени
    end_date: date
    sum_cost: float

class KeywordIntervals(BaseModel):
    keyword_id: UUID
    intervals: List[IntervalSumOut]

# --- Project ---

class ProjectBase(BaseModel):
    domain: constr(min_length=1)
    search_engine: SearchEngineEnum = Field(SearchEngineEnum.yandex, alias="searchEngine")
    schedule: ScheduleEnum = Field(ScheduleEnum.daily, alias="schedule")

    class Config:
        allow_population_by_field_name = True  # Позволяет создавать модель и по snake_case
        orm_mode = True  # Позволяет работать с ORM-моделями (SQLAlchemy)


class ProjectCreate(ProjectBase):
    keywords: List[KeywordCreate]


class ProjectUpdate(BaseModel):
    domain: Optional[constr(min_length=1)] = None
    search_engine: Optional[SearchEngineEnum] = Field(None, alias="searchEngine")
    schedule: Optional[ScheduleEnum] = Field(None, alias="schedule")
    keywords: Optional[List[KeywordUpdate]] = None

    class Config:
        allow_population_by_field_name = True
        orm_mode = True


class ProjectOut(ProjectBase):
    id: UUID
    created_at: datetime = Field(..., alias="createdAt")
    client_link: str = Field(..., alias="clientLink")
    keywords: List[KeywordOut]

    model_config = ConfigDict(
        from_attributes=True,  # Включает поддержку ORM-объектов
        populate_by_name=True  # Позволяет использовать alias при валидации и сериализации
    )


# --- Client View ---

class ClientProjectOut(BaseModel):
    id: UUID
    domain: str
    keywords: List[KeywordOut]

    class Config:
        orm_mode = True


# --- Дополнительные схемы ---

class FilterOptions(BaseModel):
    period: str  # 'week', 'month', 'custom' и т.п.


# --- Auth ---

class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str

class ManagerCreateRequest(BaseModel):
    username: str
    temporary_password: str | None = None  # если не передан — будет равен username