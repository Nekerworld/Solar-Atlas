# 테스트 기록

작성일 2026-11-20. 이 문서는 실제로 돌린 결과만 적는다. 돌리지 못한 것은 "미검증"으로 남긴다.

## 1. 자동 테스트

| 영역 | 명령 | 결과 |
| --- | --- | --- |
| 플래너 서버 (Tool 명세와 함수 일치, 평가, 재계획 판단, LangGraph 경로, 응답 모델, 로그 이벤트, 지식 Tool, GMS 호출 형식) | `cd planner_backend && pytest` | 56개 통과 |
| 2차 backend 전체 (chat completions 호출 형식, 429 비재시도, 모델 고정 포함) | `cd backend && python manage.py test` | 114개 통과 |
| 지식 검색 엔드포인트 (Django 테스트 러너) | `cd backend && python manage.py test api.test_knowledge_search` | 9개 통과 |
| 프론트 표시 로직 | `cd frontend && npx vitest run tests/unit/plannerPresentation.test.js` | 7개 통과 |
| 프론트 화면 (실제 Chrome, 플래너 API만 대체 응답) | `cd frontend && npm run build -- --base=./ && npx playwright test tests/e2e/planner.spec.js` | 3개 통과 |

- 라이브 API 테스트는 `-m live_api`로만 돈다. 기본 실행에서는 빠진다.
- 프론트 전체 `vitest`에는 이번 작업과 무관한 기존 실패 6건이 있다 (chatNavigation, naturalBodyModels, saturnPlane 2건, spacecraftModel, zoomScale). 이번에 건드리지 않았다.
- Playwright 화면 테스트는 `dist`를 라우트 가로채기로 서빙하므로 먼저 빌드해야 한다. Git Bash에서는 `--base=/`가 경로로 바뀌어 `--base=./`를 쓴다.

화면 테스트가 확인한 것은 다음과 같다.

- 처리 중 표시, Tool 호출 이력(이름, 성공/실패, 소요시간, 재사용), 재계획 지점 표시
- 실패한 Tool의 안내문에서 서버 설정 이름(키 변수 이름)이 화면에 나오지 않는 것
- 지식 답변의 근거 문서 목록과, `javascript:` 같은 링크는 열어 주지 않고 `https` 링크만 여는 것
- 플래너 서버가 꺼져 있을 때 브라우저 오류 문장(`Failed to fetch`) 대신 쉬운 안내가 나오는 것

## 2. 대표 시나리오 7건

실행: `cd planner_backend && python scripts/run_scenarios.py`

**실행 방식을 먼저 밝힌다.** GMS가 조직 지출 한도 초과(HTTP 429)로 막혀 있어서, 의도 분석(LLM) 결과는 시나리오별로 고정했다. 그 뒤의 Agent 루프, Tool 호출, 평가, 재계획, 이벤트 로그는 그대로 돌았고, Tool 3종(Google Places, JPL Horizons, Open-Meteo)은 실제 서버를 호출했다. 그래서 "자연어 → 조건 추출"은 이 표로 검증되지 않았다.

전체 결과는 `docs/samples/scenario_results.json`, 한 건의 전체 이벤트 로그는 `docs/samples/execution_log_sample.json`(S2, 55개 이벤트)이다. 응답의 `graph_path`로 각 요청이 지나간 그래프 노드도 확인했다.

| ID | 상황 | 기대 | 실제 | 일치 |
| --- | --- | --- | --- | --- |
| S1 | 모레 새벽 3~5시 반, 서울숲, 목성 | 재계획 없이 성공 | `COMPLETED`, 재계획 0회, Tool 호출 10회(장소 1, 상세 3, 천문력 3, 날씨 3). 서울숲 공원 03:00~05:30(150분), 고도 55.1°, 구름 0%, 강수확률 0% | 예 |
| S2 | 저녁 8~9시(목성이 낮은 시간) | 후보가 없어 시간 축을 넓혀 재계획 | 첫 시도 3곳 모두 `UNSUITABLE` → 시간 축 재계획 1회 → 3곳 `SUITABLE`. 이미 받은 장소 상세 3건은 재사용(`tool_result_reused` 3건). 04:00~05:30 선택 | 예 |
| S3 | 고도 85° 이상, 구름 0% (불가능한 조건) | 재계획 상한 3회에서 멈추고 이유를 사실대로 안내 | 재계획 3회에서 멈춤. 이유: 고도 기준 85°를 맞춘 시각 0/25개(가장 좋은 값 65.5°), 구름 기준 0%를 맞춘 시각 0/25개(가장 좋은 값 16%). 후보를 지어내지 않음 | 예 (아래 수정 후) |
| S4 | 예보 범위를 넘는 날짜(약 60일 뒤) | 날씨 Tool만 실패하고 나머지는 계속, 재계획하지 않고 안내 | `get_weather`가 `FORECAST_UNAVAILABLE`로 실패했지만 장소·천문력은 계속 진행. 후보는 `UNVERIFIED`이고 "구름, 강수확률 확인 못 함"으로 표시. 재계획 0회, `replan_skipped`(`non_retryable`)를 남기고 "요청한 날짜는 날씨 예보 범위를 벗어났습니다"를 안내. Tool 호출 10회 | 예 |
| S5 | "이 플래너 어떻게 써?" | Tool 호출 없이 안내 | `COMPLETED`, Tool 호출 0회, 이벤트 7개, 안내 문장 응답. 경로는 `analyze_request → validate_information → generate_response` | 예 |
| S6 | 지식 질문, 지식 서버(8000) 꺼짐 | 답을 지어내지 않고 안내 | `search_knowledge`가 `KNOWLEDGE_UNAVAILABLE`로 실패, "지식 검색 서버에 연결하지 못했습니다" 응답. 다음 요청은 정상 | 예 |
| S7 | 장소 검색 API 키 없음(실행기가 키를 비운 설정으로 대체) | 다시 시도해도 같은 오류라 재계획하지 않고 바로 안내 | `search_places` 1회가 `MISSING_API_KEY`로 실패. 재계획 0회, `errors`에 `MISSING_API_KEY`, "외부 API 키가 서버에 없습니다" 안내. 0.1초 | 예 |

### 시나리오 실행 중 찾아서 고친 문제

처음 결과가 기대와 달랐던 부분이다.

1. **S3, S4: 불충족 이유가 비어 있었다.** 연속 구간을 하나도 못 만든 후보는 `checks`가 비어서, 응답이 "관측 구간은 30분 간격 근사입니다"만 말했다. 조건별로 기준을 못 맞춘 표본 수와 가장 좋은 값을 모은 `unmet_summary`를 평가 결과에 넣고, 응답 문장이 그것을 쓰도록 했다.
2. **S4: 날씨를 모를 뿐인데 `UNSUITABLE`로 나왔다.** 일부 시각이 고도 미달이면, 날씨를 몰라서 판정하지 못한 연속 구간이 있어도 후보 전체가 불충족으로 분류됐다. 확인된 조건은 맞고 나머지가 `UNKNOWN`뿐인 연속 구간이 있으면 `UNVERIFIED`로 분류하도록 바꿨다.
3. **응답 시각이 UTC였고 재계획 기준이 영어(`time`, `place`)로 나왔다.** 서울 시각(KST)과 한국어(시간대, 검색 장소, 날짜, 천체)로 바꿨다.
4. **화면: 보내기가 항상 실패했다.** 브라우저의 `crypto.randomUUID`는 https나 localhost에서만 있어서, `http://` 주소로 접속하면 요청 ID를 못 만들었다. 요청 ID 생성에 대체 경로를 넣었다 (`frontend/src/planner/api.js`의 `newRequestId`, 단위 테스트 포함). Playwright로 화면을 직접 돌려서 발견했다.

각 항목에 해당하는 테스트를 `planner_backend/tests/test_rules.py`와 `frontend/tests/unit/plannerPresentation.test.js`에 추가했다.

### 시나리오에서 드러난 한계 (고치지 않음)

- 시작 시각이 종료 시각보다 늦은 입력("22:00~05:00")은 "시각을 어떻게 맞출까요?"라고 되묻는다. 자정을 넘는 구간은 바로 받지 않는다. 의도한 동작이지만 사용자는 번거로울 수 있다.

## 2-1. 라이브 재검증 (2026-11-20, `claude-haiku-5-5`)

GMS 실호출을 다시 돌렸다. OpenAI 경로의 429를 피해 LLM 경로를 `claude-haiku-5-5`(GMS Anthropic 경로, chat completions)로 바꿨다. 교체 후 의도 분석 1문장(`plan_observation`, 목성, 서울숲), 작업 계획(Tool 4종 선택), 2차 답변 생성 1건이 정상 응답을 받았다. 아래 6문장·시나리오 6건 결과는 직전 모델(`gemini-3.5-flash-lite`)로 돌린 기록이며 Haiku로는 재실행하지 않았다. 임시 점검 스크립트는 워크스페이스 밖에서 실행했고 저장소에 남기지 않았다. 키 값은 출력하지 않았다.

자연어 분석 6문장(시나리오 S1~S6과 같은 문장)과 전체 흐름을 실제 GMS로 돌린 결과다.

| ID | 실제 결과 | 기대 | 일치 |
| --- | --- | --- | --- |
| S1 | `COMPLETED`. 2026-11-22 03:00~05:30, 서울숲 연속 150분 관측 가능. 실제 Tool 10회 호출 | 재계획 없이 성공 | 예 |
| S2 | 1회 재계획(시간 축) 후 `COMPLETED`. 2026-11-23 04:00~05:30, 90분 | 재계획 후 성공 | 예 |
| S3 | 재계획 3회 후 `COMPLETED`. 고도 85° 이상은 0/25개 시각에서 충족, 후보 없음 | 상한 3회에서 멈추고 이유 안내 | 예 |
| S4 | `COMPLETED`, 후보는 `UNVERIFIED`. 날짜 2027-01-19(약 60일 뒤)는 맞지만, 예보 범위를 넘는다는 안내 없이 추정값으로 진행 | 예보 범위 밖 안내 | 당시 **아니오**. 이후 재계획 판단을 고쳐 지금은 재계획 없이 예보 범위 밖을 안내한다(2절 S4) |
| S5 | 사용법 안내, Tool 0회 | Tool 없이 안내 | 예 |
| S6 | `search_knowledge` 호출 → 지식 서버(8000) 꺼짐 → `KNOWLEDGE_UNAVAILABLE` 안내 | 지어내지 않고 안내 | 예 |

2차 backend 답변 생성도 같은 모델로 실호출했다. 근거 1건을 골라 `[C1]` 인용과 출처가 붙은 답을 7초에 받았다.

질문 임베딩(`text-embedding-3-large`, OpenAI 경로)은 같은 날 마지막 확인에서도 HTTP 429 `organization_spend_limit_exceeded`였다. 그래서 `search_knowledge`의 실제 근거 문서 반환(F3022)은 **미검증**이다. 지식 서버를 띄워도 질문 임베딩에서 막힌다.

### 라이브 검증에서 찾아서 고친 문제

처음 실호출 결과는 시나리오와 달랐다. 원인과 수정은 다음과 같다.

1. **분석 결과 키가 임의로 바뀌었다.** 출력 스키마 없이 자유 JSON만 요청하니 `target`, `location` 같은 키를 만들었다. JSON Schema(`response_format.schema`)를 넣어 형식을 고정했다.
2. **`intent`가 규약에 없는 값이었다.** `observation_plan`, `general_inquiry` 같은 값이 나왔다. 허용된 5개 값으로 제한했다.
3. **날짜가 비었거나 자리표시자였다.** "모레"를 계산하지 못해 `202X-0X-XX`가 나왔다. 지시문에 오늘 날짜(Asia/Seoul)를 넣고, 날짜는 `YYYY-MM-DD`, 시각은 `HH:MM`이라고 스키마 설명에 적었다.
4. **계획의 작업 형식이 맞지 않았다.** `{"search_knowledge": {...}}`처럼 답해서 "등록되지 않은 Tool"이 됐다. `{"tool", "reason"}` 목록으로 스키마를 바꾸고, `tool`은 등록된 이름만 고르도록 `enum`으로 제한했다.
5. **관측 도구가 일부만 실행돼 후보가 0개였다.** 모델이 `search_places`와 `get_ephemeris`만 골라서 장소 좌표를 얻지 못했다. 관측 계획은 장소 검색, 장소 상세, 천문력, 날씨 4종을 항상 함께 실행하도록 `normalize_tasks`에서 보장했다. 지식 질문 경로에는 영향이 없다. S1~S3가 이 수정 뒤 성공했다.
6. **분석이 간헐적으로 실패했다.** 같은 문장을 6번 보내 6번 모두 성공했고, 원인을 재현하지 못했다. 5xx와 네트워크 오류는 1회 재시도하게 했고, 429는 기존대로 재시도하지 않는다. 실패 분류(HTTP 코드, 검증 종류)는 서버 로그에만 남기고, 키와 응답 본문은 남기지 않는다.

### 아직 남은 문제 (고치지 않음, 결정 필요)

- **S4: 예보 범위 밖 날짜.** 해결했다. 날씨만 확인하지 못한 후보는 `UNVERIFIED`로 보이고, 재계획하지 않고 예보 범위 밖임을 안내한다. 날씨 없이도 천문력 결과는 보여 준다.
- **자정을 넘는 시간대(예: 20:00~04:00).** 시작이 종료보다 늦다고 되묻는다. 밤 관측에서 자주 나오는 요청이라 지원 여부를 정해야 한다.
- **2차 크롤링의 번역 모델.** `claude-haiku-5-5`로 바꿨다(2026-11-20, 실호출로 번역 JSON 응답 확인). 기존 번역 데이터는 `gpt-6-luna`로 만들어져 있으며 색인은 두 모델을 모두 인정한다. 다시 수집하면 Haiku로 새로 번역한다.

## 3. 외부 API 실호출 검증

`docs/API_VALIDATION.md`에 날짜별로 적었다. 요약은 다음과 같다.

- Google Places (검색, 상세), JPL Horizons, Open-Meteo: 성공. Open-Meteo는 예보 범위 밖 요청에서 `FORECAST_UNAVAILABLE`도 확인했다. 시나리오 S1~S4에서도 같은 3종이 실제로 호출됐다.
- Google Routes: 200 응답이 비어 있어(`{}`) 제외했다. `PLANNER_ROUTES_ENABLED=false`가 기본이라 Tool 목록과 계획에 나오지 않고, 이동시간 제한이 있으면 "확인하지 못했다"고 밝힌다.
- GMS(LLM): `claude-haiku-5-5`로 2026-11-20에 실호출 검증했다(2절 2-1). 이전 `gpt-6-luna` 호출은 OpenAI 조직 한도(429)로 막혔다. 아래 나머지 문장은 그때 기록이다. 엔드포인트는 `https://gms.ssafy.io/gmsapi/api.openai.com/v1/responses`, 모델은 `gpt-6-luna`로 코드에 고정했다. 2026-11-20 사용자가 준 curl과 같은 형식으로 호출해도 같은 429(`organization_spend_limit_exceeded`)였고, 플래너 코드 경로로 호출해도 같았다. 한도가 풀리면 `GMS_KEY`로 대표 요청 1건을 돌려 의도 분석과 계획 단계를 확인해야 한다.

## 4. 비기능 요구사항 점검 (NF3001~NF3007)

| 항목 | 점검 방법 | 결과 |
| --- | --- | --- |
| NF3001 키 관리 | 저장소 전체(`venv`, `node_modules`, `dist`, `.env`, 크롤링 캐시 제외)에서 `AIza…`, `sk-…`, `key=<긴 값>`, `X-Goog-Api-Key: <값>` 패턴을 검색. 플래너 DB 파일도 같은 패턴으로 확인. `.env`는 열지 않았다. | 일치 0건. 키는 `settings`(환경변수)로만 읽고 헤더로만 보낸다. `.env`와 `planner_backend/data/`는 `.gitignore`에 있다. 한계: 실제 키 값과 직접 대조하지는 않았다(패턴 검색만). |
| NF3002 화면 노출 제한 | `str(exc)`, `traceback`, `repr(`를 소스에서 검색. Playwright로 실패 응답과 서버 중단 상황의 화면 확인. | Tool 오류는 코드와 우리가 쓴 안내문만 응답에 담긴다. 화면은 코드별 안내문만 보이고, 서버가 준 키 변수 이름이나 브라우저 오류 문장은 나오지 않는다. GMS 429 상황에서도 응답은 "요청 분석을 구조화하지 못했습니다."뿐이었다. |
| NF3003 Tool 실패 처리 | S4(날씨 실패), S6(지식 서버 꺼짐), GMS 429 실호출, `test_planner.py`와 `test_knowledge.py`의 실패 격리 테스트. | 모두 HTTP 200과 안내 응답으로 끝났고 서비스는 계속 응답했다. 한 Tool이 실패해도 나머지 Tool은 계속 호출됐다. |
| NF3004 재계획 상한 | S3, S4, S7 | S3은 재계획 3회에서 멈추고 "재계획 상한 3회에 도달해 멈췄습니다"를 알렸다. S4와 S7은 다시 시도해도 결과가 같은 오류라 재계획 0회로 바로 안내했다. |
| NF3005 응답 시간 | 시나리오 실행기가 잰 요청 처리 시간(분석 LLM 시간 제외) | S1 7.5초, S2 13.9초, S3 21.8초, S4 7.4초, S5 0.1초, S6 2.2초, S7 0.1초. 한 번에 성공하는 대표 요청은 약 8초다. 재계획이 3회 반복되는 경우는 20초대까지 늘고, 전체 예산 상한(`PLANNER_BUDGET_SEC`, 기본 90초)이 있다. GMS가 막혀 LLM 응답 시간은 더하지 못했다. 한계: 목표 시간을 요구사항이 숫자로 주지 않아 "지장이 없는 수준"은 판단이 필요하다. |
| NF3006 모듈 분리 | 파일 구조 확인 | 프론트(`frontend/src`)와 백엔드(`planner_backend`, `backend`)가 분리돼 있다. Agent(`engine.py`, `fsm.py`, `evaluator.py`, `llm.py`, `logging_agent.py`), HTTP 입출력 모델(`schemas.py`), Tool(`app/tools/*.py`)이 파일로 나뉜다. `backend`와 `planner_backend`는 서로 import하지 않고 HTTP로만 연결한다. |
| NF3007 출처와 이용 조건 | `docs/SOURCES_AND_LICENSES.md` | 호출 한도, 약관, 표시 의무와 대응을 기록했다. 플래너 화면 하단에 Google Maps Platform, NASA JPL Horizons, Open-Meteo(CC BY 4.0) 출처를 표시한다. Google과 Horizons의 숫자 한도는 확인하지 못해 "미확인"으로 적었다. |

## 5. 기대와 다른 점, 남은 일

- 자연어에서 조건을 뽑는 단계(F3005)와 계획(F3006)은 실제 GMS로 검증했다(2절 2-1). 검증 과정에서 스키마, 날짜, 도구 묶음 문제를 고쳤다.
- 지식 검색(F3022)은 엔드포인트와 Tool을 오프라인 테스트로 확인했다. 실제 질문 임베딩은 GMS를 쓰므로 같은 이유로 근거 문서를 받아 보지는 못했다. 8000번 서버를 실제로 띄워 `POST /api/knowledge/search/`를 호출하면 색인은 열리지만 질문 임베딩 요청이 HTTP 429로 막혀 `EXTERNAL_API_ERROR`(HTTP 502, "지식 검색에 실패했습니다.")로 끝난다. 429라는 원인은 서버 쪽에서 임베딩을 직접 호출해 확인했고, 응답에는 상세 원인이 없다. 지식 서버가 꺼진 경우의 실패 처리(S6)도 실제로 확인했다.
- 원인 조사(2026-11-20): 키는 GMS에서 인증된다(틀린 키는 401). 그런데 `responses`(luna, 다른 모델 포함), `chat/completions`, `embeddings` 모두 같은 `organization_spend_limit_exceeded`(429)로 끝나고 본문이 `[OpenAI 에러]`로 시작한다. 모델 목록 조회는 500이다. 사용자 키의 30,000 크레딧 한도 문제가 아니라 GMS 뒤쪽 OpenAI 조직의 지출 한도 문제로 보인다. 코드로 풀 수 없고 GMS 운영 쪽 확인이 필요하다.
- 2차 크롤링 테스트 1건(`test_end_to_end_offline_and_resume`, 두 번째 실행의 `cached` 판정)은 이번 변경 전에도 실패한다. GMS와 무관한 기존 문제로 남아 있다.
- LLM 경로는 `claude-haiku-5-5`로 대표 호출을 검증했다. 임베딩은 OpenAI 경로(HTTP 429) 대신 GMS Gemini 경로(`gemini-embedding-2`, 3072차원)로 바꿨고 2026-11-20에 실호출로 확인했다(질문·문서 벡터 생성, 질문과 관련 문장의 유사도가 더 높음). 기존 Chroma 색인은 OpenAI 임베딩이라 새로 색인해야 F3022의 근거 문서 반환을 확인할 수 있다.
- 3일차 셀프 체크리스트 파일은 제공되지 않아, 요구사항 정의서 항목으로 `docs/REQUIREMENT_TRACEABILITY.md`에 직접 만든다.
