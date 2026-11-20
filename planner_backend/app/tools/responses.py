"""Tool 공통 응답. 예외는 밖으로 나가지 않는다."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def ok(tool: str, data: dict[str, Any], provider: str, reference: str | None = None) -> dict[str, Any]:
    return {
        "ok": True,
        "tool": tool,
        "data": data,
        "error": None,
        "source": {
            "provider": provider,
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "reference": reference,
        },
    }


def fail(tool: str, code: str, message: str) -> dict[str, Any]:
    return {
        "ok": False,
        "tool": tool,
        "data": None,
        "error": {"code": code, "message": message},
        "source": None,
    }
