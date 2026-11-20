"""Wikidata 식별자와 Horizons 명령을 이름 추정 없이 매핑한다."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ObservationTarget:
    target_id: str
    display_name: str
    kind: str
    horizons_command: str | None
    frontend_name: str | None
    wikidata_id: str | None
    supported: bool
    unsupported_reason: str | None
    aliases: tuple[str, ...]


def _target(**kwargs) -> ObservationTarget:
    return ObservationTarget(**kwargs)


TARGETS: dict[str, ObservationTarget] = {
    item.target_id: item
    for item in (
        _target(target_id="mercury", display_name="수성", kind="planet", horizons_command="199", frontend_name="Mercury", wikidata_id="Q308", supported=True, unsupported_reason=None, aliases=("수성", "Mercury")),
        _target(target_id="venus", display_name="금성", kind="planet", horizons_command="299", frontend_name="Venus", wikidata_id="Q313", supported=True, unsupported_reason=None, aliases=("금성", "Venus")),
        _target(target_id="moon", display_name="달", kind="moon", horizons_command="301", frontend_name="Moon", wikidata_id="Q405", supported=True, unsupported_reason=None, aliases=("달", "Moon", "Luna")),
        _target(target_id="mars", display_name="화성", kind="planet", horizons_command="499", frontend_name="Mars", wikidata_id="Q111", supported=True, unsupported_reason=None, aliases=("화성", "Mars")),
        _target(target_id="jupiter", display_name="목성", kind="planet", horizons_command="599", frontend_name="Jupiter", wikidata_id="Q319", supported=True, unsupported_reason=None, aliases=("목성", "Jupiter")),
        _target(target_id="saturn", display_name="토성", kind="planet", horizons_command="699", frontend_name="Saturn", wikidata_id="Q193", supported=True, unsupported_reason=None, aliases=("토성", "Saturn")),
        _target(target_id="uranus", display_name="천왕성", kind="planet", horizons_command="799", frontend_name="Uranus", wikidata_id="Q324", supported=True, unsupported_reason=None, aliases=("천왕성", "Uranus")),
        _target(target_id="neptune", display_name="해왕성", kind="planet", horizons_command="899", frontend_name="Neptune", wikidata_id="Q332", supported=True, unsupported_reason=None, aliases=("해왕성", "Neptune")),
        _target(target_id="sun", display_name="태양", kind="star", horizons_command="10", frontend_name="Sun", wikidata_id="Q525", supported=False, unsupported_reason="태양은 야간 행성·달 관측 계획 대상이 아닙니다.", aliases=("태양", "Sun")),
        _target(target_id="earth", display_name="지구", kind="planet", horizons_command=None, frontend_name="Earth", wikidata_id="Q2", supported=False, unsupported_reason="지구는 관측자 위치이며 지상 관측 대상이 아닙니다.", aliases=("지구", "Earth")),
    )
}

PRIORITY_DISCOVERY = ("jupiter", "mars", "saturn", "venus", "moon")


def resolve_target(value: str | None) -> ObservationTarget | None:
    if not value:
        return None
    key = value.strip()
    lowered = key.casefold()
    for target in TARGETS.values():
        names = {target.target_id, target.display_name, target.frontend_name or "", target.wikidata_id or "", *target.aliases}
        if any(item and item.casefold() == lowered for item in names):
            return target
    return None


def public_targets() -> list[dict]:
    return [
        {
            "target_id": item.target_id,
            "display_name": item.display_name,
            "frontend_name": item.frontend_name,
            "wikidata_id": item.wikidata_id,
            "supported": item.supported,
            "unsupported_reason": item.unsupported_reason or "",
            "kind": item.kind,
        }
        for item in TARGETS.values()
    ]
