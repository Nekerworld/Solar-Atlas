"""조건 병합. 잠긴 값은 Agent가 바꾸지 않고, 비어 있는 값은 채우지 않는다."""
from __future__ import annotations

from datetime import datetime, timezone


def field(value, source: str, locked: bool = False) -> dict:
    return {"value": value, "source": source, "locked": locked, "updated_at": datetime.now(timezone.utc).isoformat()}


def read(constraints: dict, name: str):
    item = constraints.get(name)
    if isinstance(item, dict) and "value" in item:
        return item.get("value")
    return item


def merge_constraints(previous: dict | None, updates: dict | None, source: str) -> dict:
    merged = {}
    for key, item in (previous or {}).items():
        merged[key] = dict(item) if isinstance(item, dict) else item
    now = datetime.now(timezone.utc).isoformat()
    for key, value in (updates or {}).items():
        if value is None or value == "":
            continue
        current = merged.get(key)
        if isinstance(current, dict) and current.get("locked") and source != "USER":
            continue
        locked = source == "USER" and key in {"target_id", "date_start", "search_region"}
        merged[key] = {"value": value, "source": source, "locked": locked, "updated_at": now}
    return merged


def missing_fields(intent: str, constraints: dict) -> list[str]:
    missing = []
    if intent != "discover_targets" and read(constraints, "target_id") in (None, ""):
        missing.append("target_id")
    if read(constraints, "search_region") in (None, ""):
        missing.append("search_region")
    return missing


def next_question(intent: str, constraints: dict, question_count: int, limit: int, stop: bool) -> dict:
    if intent in {"help", "ask_knowledge"}:
        return {"ask": False, "blocked": False}
    altitude = read(constraints, "min_altitude_deg")
    if altitude not in (None, ""):
        try:
            if not 0 <= float(altitude) <= 90:
                return {"ask": False, "blocked": True, "question": "고도 조건이 0도에서 90도 밖입니다.", "missing": []}
        except (TypeError, ValueError):
            return {"ask": False, "blocked": True, "question": "고도 조건을 숫자로 읽지 못했습니다.", "missing": []}
    start = read(constraints, "preferred_time_start")
    end = read(constraints, "preferred_time_end")
    if start and end and end != "24:00" and str(start) >= str(end):
        if stop or question_count >= limit:
            return {"ask": False, "blocked": True, "question": "시작 시각과 종료 시각이 모순입니다.", "missing": ["preferred_time_end"]}
        return {"ask": True, "blocked": False, "question": "시작 시각이 종료 시각보다 늦습니다. 어느 시각으로 맞출까요?", "field": "preferred_time_start", "missing": ["preferred_time_end"]}
    missing = missing_fields(intent, constraints)
    labels = {"target_id": "천체", "search_region": "지역"}
    missing = [labels[name] for name in missing]
    if not missing:
        return {"ask": False, "blocked": False}
    if stop or question_count >= limit:
        return {
            "ask": False,
            "blocked": True,
            "question": "필수 정보가 부족해 계획을 만들지 않습니다: " + ", ".join(missing),
            "missing": missing,
        }
    field_name = "target_id" if "천체" in missing else "search_region"
    question = "어떤 천체를 볼까요?" if field_name == "target_id" else "어느 지역에서 관측할까요? 지역은 추정하지 않습니다."
    return {"ask": True, "blocked": False, "question": question, "field": field_name, "missing": missing}
