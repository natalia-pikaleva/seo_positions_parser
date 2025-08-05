import enum
import uuid
from sqlalchemy import (Column, String, Integer, DateTime, ForeignKey, Enum,
                        UniqueConstraint, Boolean, BigInteger  )
from sqlalchemy.sql import desc
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
from database.db_init import Base


class ScheduleEnum(str, enum.Enum):
    daily = "daily"
    weekly = "weekly"
    manual = "manual"


class SearchEngineEnum(str, enum.Enum):
    yandex = "Яндекс"
    google = "Google"


class TrendEnum(str, enum.Enum):
    up = "up"
    down = "down"
    stable = "stable"


class Keyword(Base):
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    region = Column(String, nullable=False)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    keyword = Column(String, nullable=False)

    price_top_1_3 = Column(Integer, default=0, nullable=False)
    price_top_4_5 = Column(Integer, default=0, nullable=False)
    price_top_6_10 = Column(Integer, default=0, nullable=False)

    is_check = Column(Boolean, default=True)

    positions = relationship("Position", back_populates="keyword")
    project = relationship("Project", back_populates="keywords")

    __table_args__ = (
        UniqueConstraint('project_id', 'keyword', 'region', name='uq_project_keyword_region'),
    )


class Project(Base):
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    domain = Column(String, nullable=False)
    search_engine = Column(Enum(SearchEngineEnum), default=SearchEngineEnum.yandex, nullable=False)
    schedule = Column(Enum(ScheduleEnum), default=ScheduleEnum.daily, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    client_link = Column(String, unique=True, nullable=False)
    topvisor_id = Column(BigInteger, unique=True, nullable=True)  # Topvisor ID

    keywords = relationship("Keyword",
                            order_by=[desc(Keyword.is_check), Keyword.keyword],
                            lazy="selectin",
                            back_populates="project", cascade="all, delete-orphan")


class Position(Base):
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    keyword_id = Column(
        UUID(as_uuid=True),
        ForeignKey("keywords.id", ondelete="SET NULL"),
        nullable=True
    )
    checked_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    position = Column(Integer, nullable=True)  # null если нет в ТОП-100
    previous_position = Column(Integer, nullable=True)
    cost = Column(Integer, default=0, nullable=False)
    trend = Column(Enum(TrendEnum), default=TrendEnum.stable, nullable=False)

    keyword = relationship("Keyword", back_populates="positions")


class UserRole(str, enum.Enum):
    admin = "admin"
    manager = "manager"


class User(Base):
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    is_temporary_password = Column(Boolean, default=True)  # True, если пароль временный
