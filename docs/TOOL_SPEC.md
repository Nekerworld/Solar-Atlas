# Tool 명세

Tool은 5개다. 외부 API를 감싼 `external` 4개와, 우리 서버의 검색 엔드포인트를 부르는 `local` 1개다. 외부 API 3종(Google Places, NASA JPL Horizons, Open-Meteo)은 모두 실호출로 확인했다. 계획 저장은 Tool이 아니다. 천체 이름과 Horizons 명령 대응표도 Tool이 아니다.

## 공통 규칙

- Tool마다 이름, 설명, 구분(`external`/`local`), 제공처, 입력 JSON Schema(`input_schema`), 출력 JSON Schema(`output_schema`, 성공 시 `data`의 구조)를 `planner_backend/app/tools/__init__.py`의 `REGISTRY`에 둔다. Agent가 보는 목록은 `catalog()`이고, 계획 단계의 LLM 지시문에 이름, 설명, 필수 입력이 들어간다. 입력 명세와 실제 함수 인자가 맞는지는 테스트(`test_tool_specs_match_function_signatures`)로 확인한다.

- 응답은 `ok`, `tool`, `data`, `error`, `source`다. 성공이면 `data`가 채워지고 `error`는 `null`이다. 실패면 `error`는 `{code, message}`이고 `data`는 `null`이다.
- `source`는 `{provider, retrieved_at, reference}`다. `reference`는 호출한 주소이며 키는 들어가지 않는다.
- Tool은 예외를 밖으로 던지지 않는다. 등록되지 않았거나 입력이 맞지 않거나 실행 중 예외가 나도 `fail` 응답으로 돌려준다(`run_tool`).
- 실패 코드: `INVALID_INPUT`, `MISSING_API_KEY`, `API_TIMEOUT`, `PARSE_ERROR`, `NO_RESULT`, `EXTERNAL_API_ERROR`, `TOOL_DISABLED`와 Tool별 코드(아래).
- 한 Tool이 실패해도 Agent는 나머지 Tool을 계속 호출하고, 응답에서 확인하지 못한 항목을 `UNVERIFIED`로 밝힌다.
- 같은 입력으로 성공한 호출은 요청 안에서 재사용한다(`tool_result_reused` 이벤트).

## 목록

| 이름 | 구분 | 제공처 | 언제 부르나 | 입력 | 실패 |
| --- | --- | --- | --- | --- | --- |
| search_places | external | Google Places (New) | 지역과 장소 유형으로 후보 식별자가 필요할 때 | `region`(필수), `query`(필수), `limit` | 지역이 없으면 `INVALID_INPUT`. 키가 없으면 `MISSING_API_KEY`. 결과가 없으면 `NO_RESULT`. 서울로 채우지 않는다. |
| get_place_details | external | Google Places (New) | 검색이 준 `place_id`로 이름, 주소, 지도 링크, 좌표가 필요할 때 | `place_id`(필수) | 없으면 `NO_RESULT`. 좌표가 비면 그 후보는 `UNVERIFIED`. |
| get_ephemeris | external | NASA JPL Horizons | 좌표와 시각의 천체 고도, 방위각, 태양 고도가 필요할 때 | `target_id`, `latitude`, `longitude`, `start_at`, `end_at`(필수), `elevation_m`(기본 0), `step_minutes`(기본 30) | 고도가 없으면 `EPHEMERIS_UNAVAILABLE`. 숫자를 만들지 않는다. |
| get_weather | external | Open-Meteo | 같은 좌표의 구름량, 강수확률, 강수량이 필요할 때 | `latitude`, `longitude`, `start_at`, `end_at` | 예보 구간 밖은 `FORECAST_UNAVAILABLE`. 값을 대체하지 않는다. |
| search_knowledge | local | Solar Atlas 지식 검색(`backend`, 포트 8000) | 천체 지식 질문(크기, 원인, 위성 등)에 근거 문서가 필요할 때. 외부 API로 확인할 수 없는 질문이다. | `question`(필수, 최대 500자), `target_id`, `top_k`(1~10) | 아래 참고 |
| get_route | external | Google Routes | 이동시간 제한이 있을 때 | 출발·도착 좌표, `transport_mode` | **현재 꺼져 있다**(`PLANNER_ROUTES_ENABLED=false`). 꺼진 Tool은 목록과 계획에 나오지 않고 호출하면 `TOOL_DISABLED`. 이동시간 제한이 있으면 "확인하지 못했다"고 밝히고 값을 추정하지 않는다. |

## 출력 구조 (성공 시 `data`)

| 이름 | `data` |
| --- | --- |
| search_places | `places[]`(`place_id`, `name`, `address`), `requested_region`, `requested_query`, `queried_date`, `queried_time_start`, `queried_time_end`, `estimated`, `estimate_reason` |
| get_place_details | `place_id`, `name`, `address`, `maps_url`, `latitude`, `longitude` |
| get_ephemeris | `target_id`, `samples[]`(`time`, `altitude_deg`, `azimuth_deg`, `sun_altitude_deg`) |
| get_weather | `latitude`, `longitude`, `hours[]`(`time`, `cloud_cover_pct`, `precipitation_probability_pct`, `precipitation_mm`) |
| get_route | `duration_minutes`, `duration_seconds`, `transport_mode` |
| search_knowledge | `question`, `item_id`, `sources[]`(아래) |

## 재계획과 오류 코드

`MISSING_API_KEY`, `AUTH_FAILED`, `RATE_LIMITED`, `INVALID_INPUT`, `TOOL_DISABLED`, `FORECAST_UNAVAILABLE`, `TARGET_NOT_FOUND`, `UNSUPPORTED_TARGET`은 같은 입력으로 다시 불러도 결과가 같다. Agent는 이 오류로 후보를 판정하지 못하면 재계획하지 않고 바로 안내한다. 장소 검색의 `NO_RESULT`는 다음 장소 검색어로 재계획한다. 자세한 규칙은 `docs/AGENT_WORKFLOW.md`의 재계획 절이다.

## search_knowledge

2차 프로젝트의 Vector DB(Chroma, 위키 문서 색인) 검색을 Tool로 감쌌다(F3022). Tool 자체는 얇은 HTTP 클라이언트이고, 검색은 `backend`의 `POST /api/knowledge/search/`가 한다. `backend` 코드를 import하지 않는다. 접속 주소는 `PLANNER_KNOWLEDGE_URL`(기본 `http://127.0.0.1:8000`)이다.

- `target_id`가 관측 대상 목록에 있으면 그 천체의 Wikidata ID로 검색 범위를 좁힌다. 목록에 없으면 전체 색인에서 찾는다.
- 성공하면 `data.sources`에 근거를 담는다. 항목은 `rank`, `item_id`, `item_name`, `title`, `section`, `source_url`, `revision_id`, `distance`, `snippet`(최대 600자)이다. 답변 문장은 만들지 않는다. Agent는 발췌와 출처를 그대로 보여 준다.
- 실패 코드: `INVALID_INPUT`(빈 질문, 요청을 보내지 않음), `NO_INDEX`(색인 없음), `NO_RESULT`(관련 문서 없음), `KNOWLEDGE_UNAVAILABLE`(서버 꺼짐), `API_TIMEOUT`, `PARSE_ERROR`, `EXTERNAL_API_ERROR`(임베딩 등 하위 실패). 서버가 준 알 수 없는 코드는 일반 `EXTERNAL_API_ERROR`로 바꿔 상세를 숨긴다.
- 질문 임베딩은 GMS의 Gemini 경로(`gemini-embedding-2`)를 쓴다. 색인이 같은 임베딩으로 만들어져 있어야 하며(아니면 `NO_INDEX`/설정 불일치 오류), 임베딩 호출이 실패하면 `EXTERNAL_API_ERROR`가 된다.
