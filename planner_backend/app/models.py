"""Planner 전용 SQLite. Django 데이터베이스와 분리한다."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from app.config import ROOT, settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    current_state: Mapped[str] = mapped_column(String(40), default="IDLE")
    context_json: Mapped[str] = mapped_column(Text, default="{}")
    messages: Mapped[list["Message"]] = relationship(back_populates="conversation")


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    structured_data_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class ObservationPlan(Base):
    __tablename__ = "observation_plans"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    target_id: Mapped[str] = mapped_column(String(40))
    target_name: Mapped[str] = mapped_column(String(80))
    place_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    place_name: Mapped[str] = mapped_column(String(200))
    latitude: Mapped[float | None] = mapped_column(nullable=True)
    longitude: Mapped[float | None] = mapped_column(nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Seoul")
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32))
    constraints_json: Mapped[str] = mapped_column(Text, default="{}")
    evaluation_json: Mapped[str] = mapped_column(Text, default="{}")
    sources_json: Mapped[str] = mapped_column(Text, default="[]")
    warnings_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ExecutionEvent(Base):
    __tablename__ = "execution_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(64))
    stage: Mapped[str] = mapped_column(String(64))
    tool_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ProcessedRequest(Base):
    __tablename__ = "processed_requests"
    request_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(String(36))
    response_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


def database_path() -> Path:
    """상대 경로는 실행 위치가 아니라 저장소 루트 기준이다."""
    path = Path(settings.db_path)
    return path if path.is_absolute() else ROOT / path


def make_engine(url: str | None = None):
    from sqlalchemy.pool import StaticPool

    database_url = url or f"sqlite:///{database_path().as_posix()}"
    if database_url.startswith("sqlite:///"):
        path = database_url.removeprefix("sqlite:///")
        if path and path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
    options = {"connect_args": {"check_same_thread": False}}
    if ":memory:" in database_url:
        options["poolclass"] = StaticPool
    return create_engine(database_url, **options)


def make_session_factory(engine):
    return sessionmaker(bind=engine, expire_on_commit=False)


def init_database(engine) -> None:
    Base.metadata.create_all(engine)
