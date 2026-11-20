# API 명세

서버는 둘이다. 두 서버는 HTTP로만 연결된다. 스키마 화면은 각 서버의 `/docs`다.

플래너 서버의 요청과 응답은 모두 Pydantic 모델로 정의한다(`planner_backend/app/schemas.py`). 각 경로의 `response_model`이 그 모델이라 `/docs`와 `docs/openapi.json`에 응답 구조가 그대로 나오고, 서버가 돌려주는 본문도 같은 모델로 검증된다. 이벤트 스트림만 `text/event-stream`이다.

- **플래너 서버** `http://127.0.0.1:8001` (`planner_backend`): 대화, 계획, 로그. 이 문서의 1~3.
- **지식 검색 서버** `http://127.0.0.1:8000` (`backend`, FastAPI): 플래너의 `search_knowledge` Tool이 부른다. 이 문서의 4.

대화, 계획, 로그는 경로가 다르다. 실행은 `planner_backend`에서 `uvicorn app.main:app --port 8001`, `backend`에서 `uvicorn fastapi_app:app --port 8000`이다.

## 1. 대화

| 메서드 | 경로 | 설명 | 응답 모델 |
| --- | --- | --- | --- |
| GET | `/health` | 상태 확인 | `HealthOut` |
| GET | `/api/targets` | 관측 대상 목록 | `TargetListOut` |
| POST | `/api/sky` | 지상 천구 계산 요청(Horizons 기준) | `SkyOut` |
| GET | `/api/sky/bodies` | 천구에 올릴 소천체의 적경·적위 표. `start`(필수), `hours`(기본 720), `step_minutes`(기본 120) | `SkyBodiesOut` |
| GET | `/api/sky/orbit` | 소천체 하나의 궤도 타원. `body`, `epoch`(필수). 없는 천체는 404, 잘못된 입력은 422 | `SkyOrbitOut` |
| POST | `/api/conversations` | 대화 생성. `{"id": "..."}` | `ConversationOut` |
| POST | `/api/conversations/{id}/messages` | 메시지 전송과 Agent 실행 | `MessageOut` |
| GET | `/api/conversations/{id}/events` | 저장된 실행 이벤트 | `EventListOut` |
| GET | `/api/conversations/{id}/events/stream` | 같은 이벤트의 스트림(`event: log`) | SSE |

### 메시지 요청

```json
{ "text": "모레 새벽 서울숲에서 목성을 보고 싶어.", "request_id": "uuid", "selected_target_id": "jupiter" }
```

`text`는 필수, `request_id`는 같은 요청을 다시 보내도 한 번만 실행하는 키다. 같은 `request_id`는 저장된 응답을 그대로 돌려주고, 다른 대화에 쓰면 409다.

### 메시지 응답

| 필드 | 설명 |
| --- | --- |
| `state` | `COMPLETED`, `WAITING_USER`(되묻는 중), `FAILED` |
| `message` | 사용자에게 보일 응답 |
| `intent` | `plan_observation`, `help`, `ask_knowledge` 등 |
| `constraints` | 기준·선호·제약과 비어 있는 칸(`empty`) |
| `tasks` | 실행한 Tool 이름의 순서 |
| `tool_summaries` | Tool별 `{tool, ok, error}` |
| `candidates` | 후보별 상태(`SUITABLE`, `UNVERIFIED`, `UNSUITABLE`), 관측 구간, 판정 근거(`checks`), 제외 사유(`unmet_summary`) |
| `final_plan` | 선택된 후보. 없으면 `null` |
| `replan_count`, `replanned` | 재계획 횟수와 여부 |
| `errors` | 실패 단계의 `{code, message}`. 다시 시도해도 결과가 같은 Tool 오류(키 없음, 예보 범위 밖 등)도 여기에 담는다. 상세 원인은 담지 않는다 |
| `sources` | 지식 질문의 근거 문서 목록. 관측 계획 요청이면 빈 배열 |
| `graph_path` | 이번 요청이 지나간 LangGraph 노드 순서. 재계획이 있었으면 `replan_tasks`와 그 뒤의 `execute_tools`가 다시 나온다 |
| `events` | 이번 실행의 이벤트 |

`sources` 항목은 `rank`, `item_id`, `item_name`, `title`, `section`, `source_url`, `revision_id`, `distance`, `snippet`이다.

## 2. 계획

| 메서드 | 경로 | 설명 | 응답 모델 |
| --- | --- | --- | --- |
| GET | `/api/plans` | 목록 | `PlanListOut` |
| GET | `/api/plans/{id}` | 저장한 계획 한 건. 천체, 장소, 좌표, 시작, 종료, 상태, 생성 시각 | `PlanOut` |
| POST | `/api/plans` | 저장. 천체, 장소, 시작, 종료, 생성 시각을 담는다 | `PlanSaveOut` |
| PATCH | `/api/plans/{id}` | 수정 | `PlanSaveOut` |
| DELETE | `/api/plans/{id}` | 삭제 | `DeletedOut` |

계획이 겹치거나 미검증이어도 저장하고 경고만 반환한다. 지원 목록에 없는 천체이거나 종료가 시작보다 앞서면 422다. 없는 계획은 404다.

## 3. 로그

| 메서드 | 경로 | 설명 | 응답 모델 |
| --- | --- | --- | --- |
| GET | `/api/logs/sessions` | 세션 목록 | `LogSessionsOut` |
| GET | `/api/logs/sessions/{id}` | 한 세션의 이벤트를 순서대로 | `EventListOut` |
| DELETE | `/api/logs/sessions/{id}` | 삭제 | `DeletedOut` |

로그 수정은 405다.

## 4. 지식 검색 (backend, 포트 8000)

`POST /api/knowledge/search/` — 색인된 문서에서 근거를 찾는다. 답변 문장은 만들지 않는다.

요청:

```json
{ "question": "목성은 얼마나 큰 행성이야?", "item_id": "Q319", "top_k": 5 }
```

`question`은 1~500자, `item_id`(Wikidata ID, 예: `Q319`)는 선택이고 없으면 전체 색인에서 찾는다, `top_k`는 1~10이다.

성공(200): `{"ok": true, "data": {"question": "...", "item_id": "Q319", "sources": [...]}}`. 항목 형식은 위 `sources`와 같다.

실패: `{"ok": false, "error": {"code": "...", "message": "..."}}`

| 코드 | HTTP | 의미 |
| --- | --- | --- |
| `INVALID_INPUT` | 422 | 질문이 비었거나 `top_k`가 범위 밖임. 요청 본문 형식 자체가 틀리면(예: `item_id` 형식) FastAPI 기본 검증 오류(`detail`)가 422로 온다 |
| `NO_INDEX` | 503 | 색인이 없거나 해당 천체가 색인되지 않음 |
| `NO_RESULT` | 404 | 관련 문서 없음 |
| `EXTERNAL_API_ERROR` | 502 | 질문 임베딩 등 하위 호출 실패. 상세는 숨긴다 |

## 오류 응답

Tool 실패는 HTTP 오류가 아니라 `200`과 `tool_summaries`, `errors`로 돌려준다. 서비스 전체가 멈추지 않게 하기 위해서다. 요청 자체가 잘못된 경우(대화 없음 404, 요청 ID 충돌 409, 입력 검증 422)만 HTTP 오류다. 오류 본문에는 스택이나 외부 서버 응답, 키 이름을 담지 않는다.
