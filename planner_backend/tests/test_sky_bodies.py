import math
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app import sky_bodies
from app.main import app
from app.sky_bodies import BODIES, build_sky_bodies, build_sky_orbit, clear_sky_body_cache, kepler_polyline, parse_elements, parse_observer_rows

client = TestClient(app)
START = datetime(2026, 11, 10, tzinfo=timezone.utc)

OBSERVER_TEXT = """header
 Date__(UT)__HR:MN, , , R.A._(ICRF), DEC_(ICRF), APmag, S-brt, delta, deldot,
$$SOE
 2026-Nov-10 00:00, , , 100.50000, 20.25000, 8.10, 4.0, 2.08, 1.0,
 2026-Nov-10 02:00, , , 100.60000, 20.26000, 8.10, 4.0, 2.08, 1.0,
$$EOE
"""

ELEMENTS_TEXT = """header
JDTDB, Calendar Date (TDB), EC, QR, IN, OM, W, Tp, N, MA, TA, A, AD, PR,
$$SOE
2461000.5, A.D. 2026-Nov-20 00:00:00.0000, 0.08, 2.5, 10.59, 80.3, 73.6, 2461500.0, 0.2, 10.0, 12.0, 2.77, 3.0, 1680.0,
$$EOE
"""


def setup_function():
    clear_sky_body_cache()


def test_registry_ids_are_unique_and_known_categories():
    ids = [item.body_id for item in BODIES]
    assert len(ids) == len(set(ids))
    assert {item.category for item in BODIES} <= {"satellite", "dwarf", "asteroid", "comet", "craft"}
    for item in BODIES:
        if item.parent:
            assert item.parent in sky_bodies.PARENT_COMMANDS


def test_parse_observer_rows_reads_ra_dec_distance_and_magnitude():
    parsed = parse_observer_rows(OBSERVER_TEXT)
    assert parsed == {"ra": [100.5, 100.6], "dec": [20.25, 20.26], "delta_au": 2.08, "magnitude": 8.1}


def test_parse_observer_rows_rejects_empty_or_broken_text():
    assert parse_observer_rows("No ephemeris") is None
    assert parse_observer_rows(OBSERVER_TEXT.replace("100.50000", "n.a.")) is None


def test_kepler_polyline_is_closed_and_has_expected_radius():
    points = kepler_polyline(0.0, 2.0, 0.0, 0.0, 0.0, 91)
    assert len(points) == 91 * 3
    assert points[:3] == points[-3:]
    assert all(abs(math.hypot(points[k], points[k + 1]) - 2.0) < 1e-6 for k in range(0, len(points), 3))


def test_kepler_polyline_inclination_lifts_out_of_ecliptic():
    points = kepler_polyline(0.1, 3.0, 30.0, 0.0, 0.0, 91)
    assert max(points[2::3]) > 1.0


def test_kepler_polyline_rejects_open_orbits():
    for eccentricity in (1.0, 1.5):
        try:
            kepler_polyline(eccentricity, 2.0, 0.0, 0.0, 0.0)
        except ValueError:
            continue
        raise AssertionError("open orbit must be rejected")


def test_parse_elements_requires_all_keys():
    parsed = parse_elements(ELEMENTS_TEXT)
    assert parsed["EC"] == 0.08 and parsed["A"] == 2.77
    assert parse_elements(ELEMENTS_TEXT.replace(" W,", " X,")) is None


def test_build_sky_bodies_reports_unavailable_bodies(monkeypatch):
    def fake(params):
        if params["COMMAND"] == "'1;'":
            return OBSERVER_TEXT
        return "No ephemeris for target"

    monkeypatch.setattr(sky_bodies, "_get", fake)
    result = build_sky_bodies(START, 2, 120)
    assert result["ok"] is True
    assert [item["id"] for item in result["bodies"]] == ["ceres"]
    assert result["bodies"][0]["ra"] == [100.5, 100.6]
    assert len(result["unavailable"]) == len(BODIES) - 1


def test_build_sky_bodies_validates_input():
    assert build_sky_bodies(datetime(2026, 1, 1), 24, 120)["error"]["code"] == "INVALID_INPUT"
    assert build_sky_bodies(START, 24, 1)["error"]["code"] == "INVALID_INPUT"
    assert build_sky_bodies(START, 100000, 5)["error"]["code"] == "INVALID_INPUT"


def test_build_sky_orbit_and_cache(monkeypatch):
    calls = []

    def fake(params):
        calls.append(params)
        return ELEMENTS_TEXT

    monkeypatch.setattr(sky_bodies, "_get", fake)
    result = build_sky_orbit("ceres", START)
    assert result["ok"] is True and result["center"] == "sun" and len(result["points"]) == 241 * 3
    assert calls[0]["CENTER"] == "'500@10'" and calls[0]["REF_PLANE"] == "'ECLIPTIC'"
    assert build_sky_orbit("ceres", START) is not None
    assert len(calls) == 1


def test_build_sky_orbit_for_satellite_uses_parent_center(monkeypatch):
    seen = {}

    def fake(params):
        seen.update(params)
        return ELEMENTS_TEXT

    monkeypatch.setattr(sky_bodies, "_get", fake)
    satellite = next(item for item in BODIES if item.parent == "jupiter")
    result = build_sky_orbit(satellite.body_id, START)
    assert result["center"] == "jupiter"
    assert seen["CENTER"] == "'500@599'"


def test_build_sky_orbit_error_codes(monkeypatch):
    assert build_sky_orbit("nope", START)["error"]["code"] == "TARGET_NOT_FOUND"
    monkeypatch.setattr(sky_bodies, "_get", lambda params: "No ephemeris")
    assert build_sky_orbit("ceres", START)["error"]["code"] == "ORBIT_UNAVAILABLE"
    monkeypatch.setattr(sky_bodies, "_get", lambda params: ELEMENTS_TEXT.replace(" 0.08,", " 1.2,"))
    clear_sky_body_cache()
    assert build_sky_orbit("ceres", START)["error"]["code"] == "NO_CLOSED_ORBIT"


def test_sky_bodies_endpoint(monkeypatch):
    monkeypatch.setattr(sky_bodies, "_get", lambda params: OBSERVER_TEXT if params["COMMAND"] == "'1;'" else "")
    response = client.get("/api/sky/bodies", params={"start": "2026-11-10T00:00:00Z", "hours": 2, "step_minutes": 120})
    assert response.status_code == 200
    assert response.json()["bodies"][0]["id"] == "ceres"
    bad = client.get("/api/sky/bodies", params={"start": "2026-11-10T00:00:00Z", "hours": 2, "step_minutes": 1})
    assert bad.status_code == 422


def test_sky_orbit_endpoint(monkeypatch):
    monkeypatch.setattr(sky_bodies, "_get", lambda params: ELEMENTS_TEXT)
    ok_response = client.get("/api/sky/orbit", params={"body": "ceres", "epoch": "2026-11-20T00:00:00Z"})
    assert ok_response.status_code == 200 and ok_response.json()["ok"] is True
    missing = client.get("/api/sky/orbit", params={"body": "nope", "epoch": "2026-11-20T00:00:00Z"})
    assert missing.status_code == 404
