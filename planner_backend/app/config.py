from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "planner_backend" / ".env")


@dataclass(frozen=True)
class Settings:
    host: str = os.getenv("PLANNER_HOST", "127.0.0.1")
    port: int = int(os.getenv("PLANNER_PORT", "8001"))
    db_path: str = os.getenv("PLANNER_DB", "planner_backend/data/planner.sqlite")
    llm_mode: str = os.getenv("PLANNER_LLM", "gms")
    # GMS 엔드포인트와 모델(claude-haiku-5-5)은 llm.py에 고정한다. 키만 환경변수로 받는다(GMS_KEY, 없으면 GMS_API_KEY).
    gms_key: str = (os.getenv("GMS_KEY") or os.getenv("GMS_API_KEY") or "").strip()
    google_maps_api_key: str = (os.getenv("GOOGLE_MAPS_API_KEY") or os.getenv("GOOGLE_PLACES_API_KEY") or "").strip()
    places_key: str = (os.getenv("GOOGLE_PLACES_API_KEY") or os.getenv("GOOGLE_MAPS_API_KEY") or "").strip()
    routes_key: str = (os.getenv("GOOGLE_ROUTES_API_KEY") or os.getenv("GOOGLE_MAPS_API_KEY") or "").strip()
    knowledge_url: str = os.getenv("PLANNER_KNOWLEDGE_URL", "http://127.0.0.1:8000").rstrip("/")
    # Routes 응답이 비어 있는 문제를 확인하는 동안 꺼 둔다. 코드는 남기고 Tool 목록에서만 뺀다.
    routes_enabled: bool = os.getenv("PLANNER_ROUTES_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}
    initial_lat: float = float(os.getenv("PLANNER_INITIAL_LAT", "37.5665"))
    initial_lon: float = float(os.getenv("PLANNER_INITIAL_LON", "126.9780"))
    tool_timeout_sec: float = float(os.getenv("PLANNER_TOOL_TIMEOUT", "20"))
    place_limit: int = int(os.getenv("PLANNER_PLACE_LIMIT", "5"))
    step_minutes: int = 30
    min_altitude_deg: float = 20.0
    max_sun_altitude_deg: float = -12.0
    max_cloud_cover_pct: float = 50.0
    max_precipitation_probability_pct: float = 30.0
    min_window_minutes: int = 60
    max_replans: int = 3
    max_questions: int = 4
    total_budget_sec: float = float(os.getenv("PLANNER_BUDGET_SEC", "90"))
    cors_origins: tuple = tuple(
        item.strip()
        for item in os.getenv("PLANNER_CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173").split(",")
        if item.strip()
    )


def get_settings() -> Settings:
    return Settings()


settings = get_settings()
