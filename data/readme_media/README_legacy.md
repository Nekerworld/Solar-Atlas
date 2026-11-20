# Solar Atlas

태양계 3D 시각화와 Atlas AI 대화 서비스를 위한 프로젝트입니다.
프론트엔드는 Vue·Three.js, 백엔드는 Django·Chroma를 사용하며 SSAFY GMS로 LLM을 호출합니다.

## 최근 유지보수 기록

- 지구~명왕성의 주요 위성 21개를 화면 탐색용 강조 대상으로 지정했습니다. 장면의 주요 위성 라벨은 청록색(#A8DADC), 일반 위성은 회색(#A1A7B3), 태양·행성은 밝은 흰색(#F1F3F5)이며 영역의 기존 베이지색은 유지합니다. 현재 관찰 대상은 글자색을 유지하고 주황색 테두리로 표시합니다. 위성 목록·통합 검색에 ‘주요’ 배지를 제공하고 라벨 툴팁에 모천체와 주요 위성 여부를 표시합니다. 기본 표시·개별 숨김·줌 페이드·궤도는 변경하지 않습니다.

- 저장된 표시 설정이 없는 첫 접속은 태양·8개 행성·히이아카/나마카를 제외한 위성·명왕성·소행성대·카이퍼벨트·오르트구름을 표시합니다. 혜성·인공물과 다른 왜소행성 메뉴 항목은 숨깁니다. 초기 표시 프로필과 이후 변경은 localStorage에 저장하며, 기존 저장 설정이 있으면 새 기본값으로 덮어쓰지 않습니다. 설정 초기화는 이 초기 프로필로 돌아갑니다.

- 시각화 전용 천체 30개를 구 형태로 추가했습니다(로제타·카시니 제외, 장면 총 100개). 신규 소행성·센타우루스군·해왕성 바깥 천체는 별도 소행성 분류 없이 왜소행성 메뉴에 통합하고 보조 설명으로 실제 분류를 표시합니다. 수집 대상 등록·크롤링·임베딩·Chroma는 이번 변경에 포함하지 않습니다.
- 새 소천체 궤도는 NASA/JPL SBDB 기준 스냅샷이며, 하우메아 위성은 Ragozzine & Brown (2009) 표 2의 황도 좌표계 요소를 사용합니다. Actual Scale은 기준 궤도 요소를 사용하고 일반 모드는 근일점·원일점 거리를 기존 행성/소행성대/카이퍼벨트 간격에 맞춰 압축합니다. 구의 크기는 근사이며 위상은 현재 위치를 뜻하지 않습니다.
- 파이오니어 10·11호는 2026-10-22 JPL Horizons 예측 위치를 표시합니다. 탐사선 궤도선은 표시하지 않습니다.
- 상단 천체 라디오 버튼을 개별 눈 아이콘과 카메라 이동 버튼으로 분리했습니다. 개별 숨김은 구·모델·라벨·궤도·혜성 꼬리·마우스 선택에 적용하며, 다른 천체의 변환 계층과 태양 조명은 유지합니다. 표시 상태는 localStorage에 저장되어 축척 전환과 새로고침 후 유지되고 설정 초기화로 해제됩니다.
- 위 변경의 소스 문법/컴포넌트 컴파일과 두 장면의 100개 등록·궤도 데이터 무결성은 확인했습니다. 앱·브라우저·빌드·테스트 스위트와 RAG API는 실행하지 않았습니다.

- Atlas 채팅창 전체에 흰 별이 왼쪽으로 흐르는 배경을 표시합니다. 모던한 수평 우주선은 왼쪽에서 약 1.8초 동안 중앙으로 진입하고, 중앙에서 작은 상하좌우 움직임과 추진 궤적을 유지합니다. 실제 진행 상태와 기존 중간 대화는 유지합니다.
- 답변 도착 즉시 내용을 표시하며 우주선은 현재 위치에서 약 0.65초 동안 오른쪽으로 수평 가속합니다. 별·우주선·추진 궤적은 모두 채팅창 div 내부에 있고 경계에서 잘립니다. body로 옮기는 오버레이는 사용하지 않으며 클릭을 가로채지 않습니다. 빠른 응답은 중앙 도착을 기다리지 않습니다.
- 접힌 상태에서는 도착 표시만 제공하며, 오류·모션 감소 설정·과거 대화 복원에는 이륙 연출을 적용하지 않습니다. 모바일에서도 패널을 접으면 비행을 정리합니다.
- 수평 우주선 UI 브라우저 테스트 6개, 관련 대화 단위 테스트 12개 및 빌드를 확인했습니다. UI 검증은 대체 API 응답으로 수행해 LLM 크레딧을 사용하지 않았습니다.

- Atlas는 사이트 시작 시 항상 접힌 상태로 표시합니다. 저장 대화는 백그라운드에서 복원하며, 사용자가 직접 대화를 선택하거나 질문을 보내면 펼칩니다.

- Actual Scale 최대 줌아웃에서 오르트구름 범위까지 커진 카메라 좌표와 단위 배경 큐브 사이의 변환 정밀도 오차를 재현했습니다.
- 별 배경을 원점 고정 카메라로 분리하고 관찰 카메라의 회전·투영만 동기화했습니다. 천체 좌표와 줌 범위는 유지합니다.
- 브라우저 픽셀 회귀 테스트에서 기존 경로의 프레임 변화를 재현하고 수정 경로의 픽셀 변화가 0임을 확인했습니다.
- 전체 앱 E2E는 초기 로딩·스케일 전환 등을 진행했지만, 이후 숨겨진 목성 라디오 버튼을 선택하는 기존 단계에서 타임아웃되어 전체 통과로 처리하지 않았습니다.
- 프로덕션 빌드 성공. 단위 테스트 39개 중 38개 통과, 챗봇 천체 링크 순서 테스트 1개 실패(이번 배경 변경과 별개).
- 문서 통합 후 앱의 출처 버튼과 기존 HTML 출처 페이지가 삭제된 Markdown을 가리키지 않도록 수정했습니다.

## 통합 문서 안내

프로젝트의 Markdown 문서를 아래에 원래 파일별로 통합했습니다. 문서 내용·출처·라이선스·실행 예시는 보존하며,
문서 위치 변경에 따라 Markdown 링크만 최상위 기준으로 조정했습니다.
과거 경로·실험 결과·명령어는 각 문서 작성 당시 기록이므로 현재 상태와 다를 수 있습니다.
가상환경·설치 패키지·Git 및 생성된 빌드·임시 작업 폴더의 문서는 통합 대상에서 제외했습니다.

## 문서 목차

- [backend/API.md](#document-01)
- [backend/MODEL_ROUTING.md](#document-02)
- [backend/rag/README.md](#document-03)
- [crawling/README.md](#document-04)
- [example/ai_core_pjt_02/영화도메인_데이터/movielab_wiki/README.md](#document-05)
- [example/ai_core_pjt_02/영화도메인_데이터/README.md](#document-06)
- [example/live_codes_1021_streamlit_lab/README.md](#document-07)
- [frontend/public/assets/models/ASSETS.md](#document-08)
- [frontend/public/assets/models/COMMUNITY_ASSETS.md](#document-09)
- [frontend/public/assets/models/draco/README.md](#document-10)
- [frontend/public/assets/models/LEGACY_NASA_SOURCES.md](#document-11)
- [frontend/public/assets/models/natural/ASSETS.md](#document-12)
- [frontend/public/assets/models/natural/CREDITS.md](#document-13)
- [frontend/public/assets/models/natural/VALIDATION.md](#document-14)
- [frontend/public/assets/models/SOURCES.md](#document-15)
- [frontend/public/assets/planet-texture-maps/CREDITS.md](#document-16)
- [frontend/README.md](#document-17)
- [GIT_TRACKING.md](#document-18)

---

<a id="document-01"></a>

## 원본 문서: `backend/API.md`

# Django 태양계 채팅 API

현재는 로컬 개발용 동기 API입니다. 기존 GMS/LangChain, Chroma, LangGraph 의존성을 사용합니다.
Vue 변경은 없습니다. 사용자 계정 인증은 아직 없고, 대화 UUID로 대화를 구분합니다.

## 실행

가상환경이 활성화된 backend 터미널에서 실행합니다. 마이그레이션 파일을 포함했으므로
`makemigrations` 없이 다음 명령으로 대화 테이블을 만듭니다.

```bash
python manage.py migrate
python manage.py runserver
```

추가 라이브러리 설치나 기존 천체의 재색인은 필요하지 않습니다.
질문 처리 중에는 GMS·Wikipedia 요청과 추가 임베딩이 발생할 수 있습니다.
초기 버전은 전체 처리가 끝난 뒤 응답하므로 추가 수집 시 응답에 시간이 걸릴 수 있습니다.

## POST /api/chat/

Git Bash의 별도 터미널에서:

```bash
curl -sS http://127.0.0.1:8000/api/chat/ \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "item_id": "Q111",
  "question": "화성의 대기는 어떻게 구성되어 있어?",
  "allow_external": true
}
JSON
```

입력:

| 필드 | 의미 |
|---|---|
| `item_id` | 필수, 색인된 천체의 QID |
| `question` | 필수, 공백을 제외하고 1~2000자 |
| `conversation_id` | 생략/null이면 새 대화. 기존 UUID이면 같은 천체의 대화에 이어 질문 |
| `request_id` | 선택 UUID. 생략하면 서버 생성. 같은 요청 재전송 시 같은 값을 보내 중복 호출 방지 |
| `allow_external` | 기본 true. false이면 기존 색인만 사용 |

성공 응답에는 다음 필드가 있습니다.

```json
{
  "conversation_id": "서버가 반환한 대화 UUID",
  "turn_id": "이번 질문·답변 UUID",
  "request_id": "요청 UUID",
  "item_id": "Q111",
  "question": "화성의 대기는 어떻게 구성되어 있어?",
  "search_question": "문맥을 반영한 검색 질문",
  "status": "completed",
  "coverage": "sufficient",
  "answer": "근거를 인용한 답변 [C1]",
  "sources": [],
  "missing_information": [],
  "warnings": [],
  "graph_path": ["retrieve", "select_evidence", "generate_answer"],
  "collection": {"status": "not_needed"},
  "replayed": false
}
```

위 예시는 필드 설명용입니다. 실제 `sources`에는 답변이 인용한 ID, 저장된 제목·URL·수정 버전,
청크 ID와 검증한 원문 인용문이 포함됩니다. `coverage`는 sufficient/partial/insufficient입니다.
`completed`는 처리 완료이지 근거 충분의 보장은 아닙니다.

같은 대화에서 후속 질문을 보낼 때는 실제 반환된 `conversation_id`를 넣습니다.

```json
{
  "item_id": "Q111",
  "conversation_id": "실제 대화 UUID",
  "question": "그럼 그 대기의 기압은 지구와 비교하면 어때?"
}
```

최근 완료한 6개 질문·답변을 이용해 지시어를 독립 질문으로 바꾼 뒤 검색합니다.
기존 답변 자체를 새 질문의 사실 근거로 쓰지는 않습니다. 다른 천체를 질문하려면 새 대화를 만듭니다.

## 근거 부족 시 자동 추가 수집

```text
기존 DB 검색 → 근거 선택
  ├─ 충분 → 근거 답변·출처 반환
  └─ 부족/일부 부족 → Wikipedia에서 해결 가능한지 판단
       ├─ 불가능 → 확보된 부분 답변 또는 부족 안내
       └─ 가능 → 검색어 최대 2개 → 제목·요약으로 문서 최대 2개 선택
                  → 본문 수집 → 관련 인용문 존재 검증
                  → 청킹·임베딩·Chroma 저장
                  → DB 재검색 → 근거 재판단 → 답변/부족 안내
```

질문당 추가 수집은 최대 한 번입니다. 정확한 미래 측정값 등 검색으로 해결하기 어려운
질문은 모델의 계획 판단에 따라 외부 수집을 생략합니다. 추가 수집 후에도 근거가 부족하면
그 사실을 표시합니다. 관련성·검색 가능성·충분성 판정은 모델에 의존합니다.

문서 ID·수정 버전·청킹 설정과 레코드 해시로 재사용합니다. 추가 문서는 같은
`external_documents` 컬렉션에 천체 ID와 출처를 붙여 넣습니다. 동적 청크 ID는
`QID:kowiki:문서번호:live:수정번호:순번`입니다. 모든 배치 저장이 끝난 뒤 해당 문서의
옛 동적 청크를 정리하며 자체/초기 문서는 지우지 않습니다. 초기 `index_solar`를 다시 실행해도
질문으로 추가한 청크는 보존됩니다.

원문은 `backend/rag_runtime/documents/`, Wikipedia 요청 캐시는 `wiki_cache/`에 저장합니다.
HTTP 캐시는 24시간 재사용하며 오류 응답은 캐시하지 않습니다. Wikimedia 간격·maxlag·Retry-After를
준수하고 기존 크롤러의 문서 파서를 재사용합니다. `.env`는 기존 `crawling/.env`를 읽습니다.
오프라인 크롤러 전체를 질문마다 실행하거나 기존 processed JSON을 덮어쓰지는 않습니다.
문서당 청크는 최대 200개입니다. 중단된 배치는 다음 수집 때 해시를 확인해 재사용합니다.

`collection.status`는 not_needed/disabled/not_searchable/indexed/no_evidence/failed/busy 중 하나입니다.
실패·혼잡 시 확보된 기존 근거로 돌아가며 관련 안내를 `warnings`에 넣습니다.
`indexed`에는 이미 색인한 문서를 재사용한 경우도 포함되므로 세부 `documents[].status`로 구분합니다.

## 조회 API

```bash
curl -sS http://127.0.0.1:8000/api/celestial-objects/
curl -sS 'http://127.0.0.1:8000/api/conversations/?item_id=Q111'
curl -sS http://127.0.0.1:8000/api/conversations/실제_UUID/
curl -sS http://127.0.0.1:8000/api/conversations/실제_UUID/turns/
```

천체 목록에는 `indexed` 여부가 포함됩니다. 대화 목록·turn 목록은 최신순이며 기본 20개,
`?page=2&page_size=20`으로 페이지를 이동합니다(최대 100개).
turn에는 질문, 답변 결과, 실제 출처, 상태, 오류 코드가 저장됩니다.

같은 요청 ID의 처리 중 재전송은 202, 완료 재전송은 저장된 결과와 `replayed=true`를 반환합니다.
같은 요청 ID를 다른 질문/대화에 쓰거나 한 대화에서 서로 다른 질문을 동시에 보내면 409입니다.
처리 실패는 502와 오류 코드로 반환하며, 새 요청 ID로 같은 대화에 재시도할 수 있습니다.
같은 대화의 파일 잠금을 이용하여 실행 중인 요청을 구분하고 프로세스 중단 후 남은 processing
turn은 다음 요청 때 failed/interrupted로 표시합니다. 네트워크 처리 중 DB 트랜잭션을 열어 두지 않습니다.

## 기존 CLI

채팅 기록 저장 없이 그래프만 실행할 수도 있습니다. 이제 외부 수집이 기본으로 활성화됩니다.

```bash
python manage.py answer_solar --item Q405 --show-steps "달의 내부에 관한 최신 탐사 결과는 무엇이야?"
python manage.py answer_solar --item Q405 --no-external "달의 크레이터는 어떻게 생겼어?"
```

운영 DB 저장은 API를 통해서만 수행합니다. 그래프 상태·응답에는 API 키를 넣지 않습니다.

참고: [DRF 직렬화](https://www.django-rest-framework.org/api-guide/serializers/),
[DRF 페이지 처리](https://www.django-rest-framework.org/api-guide/pagination/).


## Current router-free chat flow

The current entry point is `rag.unified_graph.run_unified_graph`. The router,
fixed scalar comparison whitelist and their old test module were removed.
All generation roles still use gpt-6-luna; embeddings use text-embedding-3-large.

Each question searches the global Chroma index. Registered names/aliases only
reserve additional evidence per subject; they do not limit global search.
Unqualified planetary superlatives reserve all eight planets, and missing subjects
prevent a definitive comparison. Contextual references use observation/history
without an LLM rewrite. The original question is preserved for answering.

A SINGLE generation completion returns selected exact quotes, cited statements,
coverage, missing information, optional clarification, and up to two external queries.
Existing deterministic ID/quote checks operate on that same completion, with no
second evidence-selection or answer-generation request. No property enum is required.
Semantic entailment, units and scientific comparisons are still judged by the model;
exact citations alone are not a mathematical/scientific proof of correctness.

Only specific searchable evidence gaps trigger one external pass: up to two queries
and two inspected documents TOTAL. There is no separate planner/chooser completion.
New or changed documents retain a relevance/exact-quote validation call before indexing.
Complete unchanged revisions are reused. A changed index triggers one refreshed
retrieval and one final answer completion, never another enrichment loop.
Embedding queries are cached within the request. Stable facts do not receive a blanket
latest-day condition; current/dated and conflicting facts remain evidence-dependent.

POST /api/chat/ returns final JSON; POST /api/chat/stream/ returns real stage events
and a terminal result/error with {payload, http_status}. Stream stages now include
retrieve_global, answer_with_evidence and collect_wikipedia. Answers are published
after citation validation, not as raw model tokens. Existing SSE negotiation fix remains.
Cross-body conversation history and turn-level observed_item_id are preserved.
item_id is optional observation context, never a fixed search scope. The earlier
0002 migration is still required if not already applied; this change adds no migration.

This synchronous SSE adapter targets local runserver/WSGI; ASGI needs an async adapter.
Disconnected work finishes saving its turn, and retries reuse request_id.
External lookup remains Korean Wikipedia and cannot guarantee authoritative live facts.

Offline regression command (not run by Codex):
`python manage.py test api.test_unified -v 2`

---

<a id="document-02"></a>

## 원본 문서: `backend/MODEL_ROUTING.md`

# Atlas 모델 선택

2026-10-22 기준. SSAFY GMS Responses 엔드포인트를 그대로 사용합니다.

- 기본·인사·중간 멘트·위키 수집: `gpt-6-luna`.
- Luna의 계획이 비교 작업 또는 높은 추론 복잡도를 표시하면 근거 판단부터 `gpt-6.1-sol` 사용.
- 추가 탐색 후 재판단·검증 실패 후 재판단·근거 부족으로 답변 중단하려는 경우에도 승격.
- 불완전한 근거로 부분 답변을 생성할 때도 승격할 수 있음.
- Sol 예산은 요청 단위로 공유하며 근거 판단·답변 생성·비교 검토 순서에 따라 소비.
- 기본 상한은 요청당 2회. 소진하면 나머지는 Luna. Sol의 JSON 형식 재시도와 네트워크 자동 재시도는 꺼짐.
- Sol 실패 시 Luna로 돌아가며 기존의 인용 검증은 유지.
- 모델·단계·호출 횟수는 `[ATLAS MODEL]` 로그로 확인. 비밀 키와 요청 본문은 기록하지 않음.

`config/settings.py`의 `RAG_SOL_MAX_CALLS = 2`를 `0`으로 바꾸면 Sol을 비활성화합니다.
변경 후 Django 서버를 재시작하세요. 호출 횟수 제한은 크레딧 금액 제한이 아닙니다.
실제 비용은 입력·출력 길이와 GMS 정책에 따라 달라집니다.

## 최소 검증

- Django API 회귀 테스트 80개 통과(모델 선택 테스트 4개 포함, 외부 API 호출 없음).
- 실제 GMS Sol 요청 1회: 준비한 단일 인용문으로 목성에 관한 출처 기반 답변 생성 성공.
- 이 확인은 모델 연결 점검이며, 검색을 포함한 전체 HTTP 성능 평가나 정확도 비교가 아닙니다.
- 원본 Chroma와 사용자 대화 DB는 이 연결 점검에서 수정하지 않았습니다.

## 실험 폴더 삭제

`backend/evaluations`는 개발용 실행 도구·원시 결과·복제 DB·보고서입니다.
운영 모듈은 이 폴더를 import하지 않으므로 전체 삭제해도 정상적인 `config.settings` 실행에는 영향이 없습니다.
`config/evaluation_settings.py`만 선택적으로 이 경로를 쓰는 실험 전용 설정입니다.
실험 서버가 종료된 후 삭제하면 됩니다. 삭제하면 과거 원시 답변과 재현 도구는 함께 사라집니다.
이번 수정에서는 삭제하지 않았습니다. 운영 데이터인 `backend/chroma_db`, `backend/db.sqlite3`,
크롤링 원본 데이터 폴더는 실험 폴더와 다릅니다.

---

<a id="document-03"></a>

## 원본 문서: `backend/rag/README.md`

# 태양계 데이터 색인·검색·근거 답변

크롤링 데이터 색인·검색과 LangGraph 기반 근거 답변을 제공합니다. 질문별 Wikipedia 추가 수집과 Django 채팅 API를 연결했습니다. API 사용법은 backend/API.md에 있습니다.
LangChain `OpenAIEmbeddings`로 GMS를 호출하고, Chroma Python 클라이언트로 로컬에 저장합니다.
기존 임베딩·저장·검색·인용 검증 함수를 그래프에서 재사용합니다.

## 실행 (사용자가 직접 실행)

프로젝트 최상위에서 공용 가상환경을 활성화하고 의존성을 설치합니다.

```powershell
cd C:\YS\업무\2026_SSAFY\SSAFY_Repo\SSAFY\AI_core_pjt
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m pip check
cd backend
python manage.py check
```

먼저 달 하나를 미리 봅니다. 실제 API 요청, `.env` 로딩, Chroma 생성/쓰기 없이 JSON과 청크를 검사합니다.

```powershell
python manage.py index_solar --only Q405 --dry-run
```

달을 실제로 임베딩하고 저장합니다. Django/Vue 서버를 실행할 필요는 없습니다.

```powershell
python manage.py index_solar --only Q405
```

성공 시 `INDEX OK`와 컬렉션별 개수가 출력됩니다. 같은 명령을 다시 실행하면 변경 없는 레코드는
`reused`로 처리하고 GMS에 재요청하지 않습니다. `--force`는 변경 없는 자료도 다시 과금 요청하므로
필요할 때만 사용합니다. 실패 시 같은 명령으로 다시 실행하면 저장된 배치는 재사용합니다.

완료된 전체 천체 색인은 다음 명령입니다. `--only` 실행은 다른 천체의 색인을 삭제하지 않습니다.

```powershell
python manage.py index_solar --dry-run
python manage.py index_solar
```

`collection_report.json`에서 `complete`/`cached` 상태이며 `search_text`가 있는 천체만 선택합니다.
실패한 명왕성 등은 `SKIP`으로 표시합니다. `--only Q339`처럼 명시한 천체가 미완료이면 오류로
중단합니다. 수집 실패를 임의의 메타데이터로 채우지 않습니다.

## 저장 및 청킹

- 입력: `crawling/data/solar_v1/processed/`의 천체, 문서, 연결, 수집 보고서 JSON.
- 출력: `backend/chroma_db/` (자동 생성, Git 제외).
- `celestial_metadata`: 천체 ID당 `search_text` 1건.
- `external_documents`: 자체 문서를 반드시 포함한 연결 문서의 본문 청크.
- 모델 `text-embedding-3-large`, 3072차원, cosine 거리.
- 기본 1000자 / 겹침 150자. 절을 넘겨 합치지 않고 문단 경계를 우선합니다.
- 원문 `paragraphs[].text`만 사용합니다. `raw_html`이나 전체 JSON을 임베딩하지 않습니다.
- 각주/참고 문헌/외부 링크 절과 일부 MediaWiki CSS·각주 표시를 제외합니다.
  과학 수식은 보존하며 모든 위키 잡음을 제거하는 정제기는 아닙니다.
- 문서 연결은 `(item_id, document_id)`로 합치고 여러 역할은 `roles`로 보존합니다.
- 청크 ID: `Q405:kowiki:문서번호:0000`.
- 메타데이터: 천체·문서 ID, 제목, 절, 원문 URL, 수정 버전·URL, 라이선스 URL,
  역할, 문단 ID(JSON 문자열), 청크 순번·크기·겹침·청킹 버전.
- 본문·메타데이터 해시로 재실행을 판별합니다. 변경된 레코드는 upsert하고,
  해당 천체의 두 컬렉션 처리가 성공한 뒤 남은 예전 청크 ID만 제거합니다.
  중단 직후에는 예전/새 청크가 섞여 있을 수 있으므로 같은 명령을 끝까지 재실행하세요.
- 색인 명령은 동시에 여러 개 실행하지 마세요.

설정은 `backend/config/settings.py`의 `RAG_INDEX`에 있습니다. 기본 경로는 절대 경로로 계산합니다.
API 키는 기존 `crawling/.env`의 `GMS_KEY`를 사용하며 이미 설정된 환경변수가 우선합니다.

```powershell
python manage.py index_solar --only Q405 --chunk-size 1000 --chunk-overlap 150 --batch-size 16
```

청크 크기는 100~6000자, 겹침은 크기 미만, 배치는 1~128개로 제한합니다.
입력당 8191 UTF-8 바이트의 보수적 상한으로 토큰 제한 초과를 방지합니다.
너무 긴 청크/메타데이터는 API 요청 전에 오류로 알립니다.
모델·차원이 기존 컬렉션과 다르면 저장을 거부합니다. 변경 시 새 `--chroma-dir`을 사용하고
문서와 질문에 같은 설정을 사용하세요. 청킹 설정 변경은 같은 저장소에서 재실행할 수 있습니다.

## 오프라인 테스트

설치 후 backend에서 실행합니다. 모의 임베딩 및 임시 Chroma DB를 사용하며 GMS 과금은 없습니다.

```powershell
python manage.py test api.test_indexing -v 2
```

청크 길이·겹침·절 경계, 연결 중복 제거, 미완료 천체 거부, 재실행·중단 복구,
다른 천체 보존, 오래된 청크 제거, 실제 로컬 Chroma 저장·검색·차원 불일치를 검사합니다.

공식 참고: [LangChain OpenAIEmbeddings](https://reference.langchain.com/python/langchain-openai/embeddings/base/OpenAIEmbeddings),
[Chroma 클라이언트](https://docs.trychroma.com/reference/python/client),
[Chroma 컬렉션](https://cookbook.chromadb.dev/core/collections/).

## 질문 검색 검증 (답변 생성 전 단계)

가상환경이 활성화된 backend 터미널에서 실행합니다. 추가 패키지 설치는 필요 없습니다.
검색은 기존 두 컬렉션을 열며 색인을 새로 생성하거나 문서를 추가하지 않습니다.
질문 1개를 기존과 같은 GMS 모델·차원으로 임베딩하므로 임베딩 API 사용량이 발생합니다.
Django/Vue 서버는 켜지 않아도 됩니다.

```bash
python manage.py test api.test_indexing api.test_retrieval -v 2
python manage.py search_solar --item Q405 --top-k 5 "달의 크레이터는 어떻게 생겼어?"
python manage.py search_solar --item Q405 --top-k 5 "달의 바다와 고지는 어떻게 달라?"
python manage.py search_solar --item Q405 --top-k 5 "달의 기원에 관한 충돌설은 무엇이야?"
```

출력에는 기본 근거인 달 메타데이터, 검색한 청크의 전체 본문·제목·절·URL·문단 ID,
cosine distance가 포함됩니다. 거리는 작을수록 질문 벡터와 가깝다는 뜻이며,
정답 확률이나 답변 가능 여부를 보장하지 않습니다. `SEARCH OK`는 검색 수행 성공이고,
질문과 실제 본문의 관련성은 출력에서 별도로 확인해야 합니다.

선택 천체로 검색 범위를 제한하며, 공백을 정규화한 동일 본문은 중복 제거합니다.
인접한 청크의 겹치는 구간 전체를 제거하는 것은 아닙니다. 청크 수와 중복 제거 결과에 따라
요청한 top-k보다 적게 반환될 수 있습니다. 검색 함수 `rag.retrieval.retrieve`는
이후 LangGraph 검색 노드에서 재사용합니다.

```bash
python manage.py search_solar --item Q405 "달의 크레이터는 어떻게 생겼어?" --json
```

`--json`은 같은 결과를 JSON으로 출력합니다. 선택 옵션으로 `--chroma-dir`, `--env-file`을
지원합니다. DB·컬렉션·천체가 없거나 모델 설정이 다르면 임베딩 요청 전에 오류를 알립니다.

## 관련 근거 선택 및 출처를 포함한 답변

`answer_solar`는 LangGraph 기반 검증용 관리 명령입니다. 다음 순서로 동작합니다.

1. 선택 천체의 기존 Chroma에서 질문 관련 청크 후보를 최대 12개 검색합니다.
2. `gpt-6-luna`가 천체 메타데이터와 후보를 읽어 직접 관련 있는 원문 인용문을 고릅니다.
3. 선택 ID와 인용문이 실제 검색 결과에 존재하는지 코드로 검사합니다.
4. 검증된 인용 근거를 모델에 전달해 문장별 근거 ID가 붙은 답변을 만듭니다.
5. 선택되지 않은 ID, 없는 ID, 인용 없는 문장, 모델이 만든 URL이 포함된 문장은 제외합니다.
6. 답변에서 실제 인용한 ID만 저장된 제목·URL·수정 버전·청크 ID에 연결합니다.

`M1`은 천체 메타데이터, `C1` 이후는 이번 검색의 후보 청크 ID입니다. 짧은 인용 ID는
질문마다 다시 부여하며 출력의 `record_id`가 영구적인 Chroma ID입니다.

```bash
python manage.py test api.test_indexing api.test_retrieval api.test_answering -v 2
python manage.py answer_solar --item Q405 "달의 크레이터는 어떻게 생겼어?"
python manage.py answer_solar --item Q405 "달의 바다와 고지는 어떻게 달라?"
python manage.py answer_solar --item Q405 "달의 기원에 관한 가설은 뭐야?"
python manage.py answer_solar --item Q405 "내일 달의 고요의 바다에서 측정될 정확한 온도는 몇 도야?"
```

설치된 의존성을 그대로 사용하며 재색인은 필요 없습니다. 서버도 켤 필요 없습니다.
기존 DB만 사용하는 --no-external 실행에는 질문 임베딩 1회와 모델 호출 최대 2회(근거 선택·답변)가 필요합니다. 기본 실행은 근거 부족 시 추가 수집·재검색 호출이 발생할 수 있습니다.
관련 근거가 없다고 판단되면 답변 생성 호출을 생략합니다. 네트워크 오류에 대한
SDK 재시도는 추가 요청을 발생시킬 수 있습니다. 단위 테스트는 모두 모의 응답을 사용합니다.

결과의 `coverage`는 다음 의미입니다.

- `sufficient`: 선택한 근거로 질문 전체에 답할 수 있다고 모델이 판단함.
- `partial`: 일부만 답변 가능. 부족한 정보를 함께 표시함.
- `insufficient`: 유효한 답변 근거가 없어서 사실 답변을 생성하지 않음.

`ANSWER OK`는 명령 처리 완료를 뜻하며, 답변 가능 여부는 `coverage`로 확인합니다.
인용문 존재와 ID·URL 매핑은 코드로 검증하지만, 답변이 인용문에서 논리적으로 도출되는지와
관련성·충분성 판정은 모델 평가에 의존합니다. 이는 과학적 정확성의 보장이 아닙니다.
검색 후보에 필요한 자료가 빠져 있으면 답변에서 그 부분을 채우지 않습니다.

```bash
python manage.py answer_solar --item Q405 --candidates 20 --max-evidence 8 "달의 바다와 고지는 어떻게 달라?"
python manage.py answer_solar --item Q405 "달의 크레이터는 어떻게 생겼어?" --json
```

`--json`에는 `answer`, `coverage`, `statements`, `sources`, `missing_information`,
`selected_evidence`, `warnings`가 포함됩니다. 실제 사용한 출처만 `sources`에 포함하고,
선택했지만 답변에서 인용하지 않은 근거는 출처 목록에 넣지 않습니다.
`--candidates`는 1~20개, `--max-evidence`는 1~12개입니다.
답변 모델은 Django 설정 `RAG_ANSWER_MODEL`이 있으면 사용하고 기본값은 `gpt-6-luna`입니다.

아래 LangGraph 연결 절에서 노드 구성과 실행 명령을 확인할 수 있습니다.

## LangGraph 연결

`answer_solar`는 이제 `rag/graph.py`의 실제 컴파일된 `StateGraph`를 실행합니다.
설치는 기존 가상환경에서 최상위 requirements.txt를 사용합니다.

```bash
# backend 터미널 기준
python -m pip install -r ../requirements.txt
python -m pip check
python manage.py check
python manage.py test api.test_indexing api.test_retrieval api.test_answering api.test_graph -v 2
```

흐름은 다음과 같습니다.

```text
START → retrieve → select_evidence
                         ├─ sufficient / partial → generate_answer → END
                         └─ insufficient         → insufficient    → END
```

`generate_answer` 노드는 기존 인용 검증·출처 연결 함수까지 수행합니다.
`insufficient` 노드는 모델 호출 없이 부족 안내를 만듭니다. 인용문이 검증에 실패해 근거가
없어졌을 때도 이 분기로 갑니다. 기존 검색·메타데이터·출처 처리와 부분 답변 정책은 유지합니다.

```bash
python manage.py answer_solar --item Q405 --show-steps "달의 크레이터는 어떻게 생겼어?"
python manage.py answer_solar --item Q405 --show-steps "달의 바다와 고지는 어떻게 달라?"
python manage.py answer_solar --item Q405 --show-steps "내일 달의 고요의 바다에서 측정될 정확한 온도는 몇 도야?"
```

`--show-steps`는 시작하는 노드 이름을 즉시 출력합니다. 끝에는 `Graph:` 경로도 표시합니다.
JSON 결과에는 `graph_path`가 추가됩니다. `--json --show-steps`를 함께 쓰면 진행 표시는 stderr로
출력하여 stdout JSON을 유지합니다. 기존 `--candidates`, `--max-evidence`도 그대로 지원합니다.

그래프 상태에는 질문·천체 ID·최근 대화·검색 결과·선택 근거·수집 계획과 결과·답변·실행 경로를 저장합니다.
API 키와 모델/DB 클라이언트는 상태에 넣지 않습니다. 그래프 자체 재시도나 체크포인트는
추가하지 않았고, 기존 SDK의 네트워크 재시도 설정을 사용합니다. 호출별 상태는 분리됩니다.

근거 부족 시 외부 검색·추가 수집·재색인·재검색 분기와 대화 저장을 연결했습니다. 최신 API 및 실행 안내는 backend/API.md를 참고하세요.
현재 그래프를 사용하기 위해 LangGraph CLI, Studio, 별도 서버 또는 LangSmith 계정은 필요하지 않습니다.

공식 문서: [LangGraph 설치](https://docs.langchain.com/oss/python/langgraph/install),
[Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api).


## Django 채팅 API와 추가 수집

최신 실행 방법, API 스키마, 대화 저장과 추가 수집 제한은 `backend/API.md`를 참고하세요.
초기 색인을 다시 실행해도 `origin=question`인 추가 문서는 보존합니다.

---

<a id="document-04"></a>

## 원본 문서: `crawling/README.md`

# 태양계 지식 수집 파이프라인

Python 3.10 이상. 태양, 수성~해왕성, 명왕성, 달, 포보스, 데이모스 13개를 수집합니다.
Wikipedia/Wikidata는 공식 MediaWiki API로 수집합니다. Selenium/브라우저는 필요하지 않습니다.
LLM은 SSAFY GMS Responses API의 `gpt-6-luna`를 사용합니다.

## 설치 및 실행 (PowerShell)

```powershell
cd C:\YSSAFY\SSAFY\AI_core_pjt\crawling
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\Activate.ps1
python collect.py
```

기본 키 파일은 `collect.py`와 같은 폴더의 `crawling/.env`입니다.
`python collect.py`만 실행하면 이 파일을 Python 코드에서 직접 읽습니다. 실행 위치와 무관하게 스크립트 기준 절대 경로로 찾습니다.
`GMS_KEY`를 읽으며 파일을 복사하거나 수정하지 않습니다. 이미 설정된 환경변수가 우선합니다.
`WIKI_CONTACT`도 User-Agent에 반영합니다. 키나 인증 헤더는 저장하지 않습니다.

```powershell
# 달만 검증 수집 (실제 네트워크와 LLM 호출 발생)
.\.venv\Scripts\python.exe collect.py --only Q405
# 출력 위치와 관련 문서 수 조정
.\.venv\Scripts\python.exe collect.py --max-related 6 --output .\data\solar_custom
# 원문 및 LLM 결과를 모두 새로 요청 (과금 재발생 가능)
.\.venv\Scripts\python.exe collect.py --refresh
# 키 파일 경로 변경
.\.venv\Scripts\python.exe collect.py --env-file C:\path\to\.env
```

## 처리 흐름

1. 고정된 QID 13개 → Wikidata 한국어 sitelink → 자체 문서 수집.
2. HTML 원문, 수정 버전, URL, 절/문단, 정보상자/표를 보존.
3. Wikidata 수치·단위·qualifiers·references·rank 보존. 명확한 일부 단위만 정규화.
4. 유형별 기준과 본문을 LLM에 전달하여 사실·가설 추출. 원문에 존재하는 정확한 인용문만 통과.
5. LLM이 부족한 항목, 관련 주제 최대 4개, 검색어와 평가 질문을 제안.
6. 실제 Wikipedia 검색 후보 중 최대 2개씩 선택. 본문을 다시 읽고 근거 인용문 확인.
7. 기본 천체당 관련 문서 최대 4개. 자체 문서는 상한·길이 필터와 무관하게 포함.
8. 연결 무결성 확인 후 JSON 출력. 실패한 천체가 있어도 나머지는 계속 진행.

`--max-related`는 상한입니다. 검색 주제는 현재 최대 4개이므로 상한을 늘려도 무한 확장하지 않습니다.
원문 한 개는 문서 ID 기준 재사용하고 천체별 연결은 별도로 저장합니다.
문단은 요청 크기를 제한하기 위해 최대 3500자로 분할하고 요청당 약 14000자씩 처리합니다.
이는 RAG 청킹이 아닙니다. 청킹·임베딩·벡터 DB 구축·답변 생성은 포함하지 않습니다.

## 결과 구조

기본 출력은 `data/solar_v1`이며 기존 `data`의 다른 수집 결과는 건드리지 않습니다.

| 경로 | 내용 |
|---|---|
| `raw/QID.wikidata.json` | Wikidata 원본 응답 |
| `documents/PAGE_ID.json` | 재사용 가능한 Wikipedia 원문·문단·수정 버전 |
| `items/QID.json` | 천체별 체크포인트, 사실, 거절 결과, 계획, 검색 이력 |
| `cache/*.json` | HTTP 및 GMS 응답 캐시. 인증 헤더 제외 |
| `processed/celestial_objects.json` | ID, 이름, 별칭, 유형, 관계, 구조화 속성, 검색용 텍스트 |
| `processed/documents.json` | 실제 연결된 자체/관련 문서 |
| `processed/facts.json` | 본문 추출 값·설명·단위·조건·가설 여부·문서/문단 근거 |
| `processed/item_documents.json` | 천체와 문서의 다대다 연결, 역할, 이유, 근거 |
| `processed/research_plans.json` | 관련 주제·질문·자체 문서 정보 확보 현황 |
| `processed/collection_history.json` | 검색어·후보·선택·본문 검증 결과 |
| `processed/collection_report.json` | 완료/실패, 오류 단계, 연결 무결성, 검토 필요 항목 |

`properties`의 Wikidata 정보와 `facts`의 LLM 본문 추출 결과는 출처별로 분리합니다.
`somevalue`, `novalue`, 누락을 0으로 바꾸지 않습니다. 해결하지 못한 단위는 원래 단위 ID로 보존합니다.
`parent_id`, `type`은 초기 13개를 위한 명시적 시드 설정이며 출처 표기를 포함합니다.
숫자 충돌은 덮어쓰거나 평균내지 않고 각 진술과 측정 조건을 보존합니다.
`research_plans.coverage`는 자체 문서 추출 결과에 대한 검토용 상태이며 모든 자료의 완전성을 보증하지 않습니다.

## 재실행과 오류

동일 설정의 완료 천체는 건너뜁니다. 실패/부분 완료 천체는 단계를 재실행하되 동일 요청의 원문/LLM 캐시를 재사용합니다.
중단 시 이미 저장된 응답은 유지됩니다. JSON 파일은 임시 파일 후 교체합니다.
HTTP 429/5xx와 연결 오류는 최대 4회 재시도합니다. 401/403은 재시도하지 않습니다.
모델 JSON 형식 오류는 임의로 고치지 않고 실패로 기록합니다. 점검 후 `--only QID --refresh`로 다시 요청할 수 있습니다.
`--refresh` 없는 캐시는 스냅샷이며 Wikipedia 최신 수정 확인을 자동으로 하지 않습니다.
`--only`로 실행하면 합본 processed 파일은 선택한 천체만 포함합니다. 전체 합본은 옵션 없이 재실행하면 됩니다.
종료 코드: 0 처리 완료, 1 수집 실패/부분 완료, 2 설정/저장 오류.
처리 완료는 과학적 사실 검증 완료를 뜻하지 않습니다. 원문 오류나 LLM 해석 오류는 사람이 검토해야 합니다.
인용문 포함 여부는 검사하지만 인용문이 해석을 충분히 뒷받침하는지까지 결정적으로 증명하지는 못합니다.
관련 문서 부족과 미확보 정보는 보고서에 남기고 사실을 만들어 채우지 않습니다.

## 오프라인 검증

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

모의 응답으로 처리하며 네트워크 호출과 실제 API 과금이 없습니다.
최초 개발 검증에서는 실제 GMS 연결 및 실데이터 수집을 실행하지 않았습니다.
API 사양 참고: https://developers.openai.com/api/reference/resources/responses/methods/create

## Wikimedia 연락처와 요청 제한

`.env`의 `WIKI_CONTACT`를 User-Agent에 자동 반영합니다. 영문 이메일 또는 전체 HTTP(S) URL이어야 합니다.
예: `WIKI_CONTACT=chrisabc94@gmail.com`. 연락처를 코드에 하드코딩하지 않습니다.
시작 시 연락처 형식을 검사하고, 없으면 안내와 함께 Wikimedia 호출 간격을 최소 6.1초로 늘립니다.
연락처가 있어도 Wikimedia 호출 간격은 최소 1초입니다. 캐시 응답에는 대기가 없습니다.
순차 요청만 사용하며 `maxlag=5`를 전송합니다.
HTTP 429/5xx는 Retry-After(초/HTTP 날짜)를 따르며 이전의 120초 상한을 제거했습니다.
HTTP 200의 maxlag/ratelimited/readonly 오류도 제한 횟수 내 재시도합니다. maxlag는 최소 5초 대기합니다.

공식 안내의 비인증 봇 한도는 적절한 User-Agent가 있을 때 분당 200회, 식별되지 않은 요청은 분당 10회입니다.
이 한도는 변경될 수 있으며 공유 IP, 요청 종류, 서버 상태에 따른 추가 제한이 적용될 수 있습니다.
연락처는 인증 정보가 아니고 무제한 권한을 주지 않습니다. 여러 프로세스의 요청 합계는 이 코드만으로 제어하지 못합니다.
공식 정책: https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits

검증: 연락처를 포함한 실제 Wikipedia siteinfo 읽기 요청 1회 HTTP 200 확인.
대량/한계 부하 테스트와 GMS 호출, 전체 데이터 수집은 실행하지 않았습니다.

---

<a id="document-05"></a>

## 원본 문서: `example/ai_core_pjt_02/영화도메인_데이터/movielab_wiki/README.md`

# Movie Lab 위키백과 문서 데이터셋 — 배포 안내

영화 964편에 대해 한국어 위키백과에서 모은 **문서 원문 모음**입니다.
위키백과 API 호출이 막히거나 요청 한도에 걸리는 환경에서 **수집 단계를 대신**할 수 있습니다
(요구사항 F2004 — "위키백과 호출이 제한되는 환경에서는 제공된 문서 묶음을 읽어 수집 단계를 대신할 수 있다").

**색인은 포함하지 않습니다.** 청킹·임베딩·색인은 직접 해야 합니다. 그 과정이 과제의 일부입니다(F2005).

---

## 들어 있는 것

| 항목 | 값 |
|---|---|
| 영화 | 964편 (한국 영화 168편) |
| 문서 | 3,725건 (영화–문서 쌍) · 고유 문서 2,661건 · 영화당 평균 3.86건 (최대 10건) |
| 파일 | `wikipedia/*.json` 3,725개 + `wiki_manifest.json` 1개 |
| 압축 전 용량 | 약 57MB |
| 수집 시점 | 2026-09 (문서 본문은 수집 당시 스냅샷) |
| 출처 | 한국어 위키백과 — CC BY-SA 4.0. 출처와 원문 링크를 함께 표시해야 합니다 |

문서 수는 영화마다 다릅니다. 6건 이상 14편 · 5건 289편 · 4건 340편 · 3건 216편 · 2건 77편 · **1건 28편**입니다.
한국어 위키에 관련 문서가 거의 없는 작품은 1~2건에 그칩니다.

---

## 파일 구조

```
wikipedia/
  {movie_id}_{문서제목}.json     예) 157336_인터스텔라.json, 157336_웜홀.json
wiki_manifest.json               영화별 수집 이력
```

파일 이름 앞의 `movie_id`는 `movies.json`의 영화 ID입니다.
여러 영화가 같은 문서를 모으면 파일이 각각 생기므로, **파일 수(3,725)가 고유 문서 수(2,661)보다 많습니다.**

### 문서 JSON 필드

| 필드 | 설명 | 예시 |
|---|---|---|
| `page_id` | 위키백과 문서 ID | `44324` |
| `title` | 문서 제목 | `명량 해전` |
| `url` | 원문 URL — **근거 표시에 사용** | `https://ko.wikipedia.org/wiki/...` |
| `text` | 본문 전문 (태그 없는 평문) | `1597년 정유재란 중...` |
| `source` | 출처 명칭 | `한국어 위키백과` |
| `movie_id` | 이 문서를 모으게 한 영화 ID | `12477` |
| `related_movie` | 그 영화의 제목 | `명량` |
| `search_query` | 이 문서를 찾은 검색 키워드 | `명량 해전` |
| `collected_at` | 수집 일자 | `2026-09-21` |

### `wiki_manifest.json`

영화 ID를 키로 하는 수집 이력입니다. 재수집을 막는 용도이며, 색인에는 필요하지 않습니다.

| 필드 | 설명 |
|---|---|
| `keywords` | 이미 검색한 키워드 목록 |
| `titles` | 수집한 문서 제목 |
| `page_ids` | 수집한 문서 ID |
| `chunks` | 참고용 청크 수 (수집한 쪽 기준) |
| `collected_at` | 마지막 수집 일자 |

---

<a id="document-06"></a>

## 원본 문서: `example/ai_core_pjt_02/영화도메인_데이터/README.md`

# 참고 구현 자료 — 영화 도메인 팩 (Movie Lab)

참고 구현 **Movie Lab**이 쓰는 데이터 두 가지를 모았습니다. 요구사항정의서의 **제공 도메인 팩(영화)** 이 이것입니다.

| 파일 · 폴더 | 내용 | RAG에서의 역할 |
|---|---|---|
| `movies.json` | 영화 964편의 메타데이터 (한국 영화 168편) | **RAG 1** — 항목 메타데이터 |
| `movielab_wiki/` | 위 영화들에 대해 한국어 위키백과에서 모은 문서 원문 3,725건 (고유 문서 2,661건) | **RAG 2** — 외부 문서 |

> **색인(Vector DB)은 들어 있지 않습니다.** 청킹 · 임베딩 · 색인은 직접 합니다. 그 과정이 과제입니다.

---

## 언제 쓰나

- **1일차 16:00까지 내 도메인의 항목 데이터를 확보하지 못했을 때** — 영화 팩으로 전환합니다. `movies.json`을 항목 메타데이터로 씁니다.
- **위키백과 호출이 막히거나 요청 한도에 걸렸을 때** — `movielab_wiki/`의 문서를 읽어 수집 단계를 대신할 수 있습니다 (F2004).
  이 묶음은 **대비책**입니다. 검색 · 선별 · 수집 코드는 직접 구현해야 합니다.
- **내 도메인으로 하더라도** — 항목 데이터와 문서 하나에 어떤 필드를 남기면 좋은지 참고합니다.

---

## movies.json

배열 하나이고, 원소 하나가 영화 한 편입니다.

| 필드 | 설명 | 예시 |
|---|---|---|
| `movie_id` | 영화 ID (TMDB 영화 ID, **문자열**). 위키 문서 파일 이름 앞의 번호와 같습니다 | `"157336"` |
| `title` · `original_title` | 한국어 제목 · 원제 | `"인터스텔라"` · `"Interstellar"` |
| `release_date` · `year` | 개봉일 · 연도 | `"2014-11-05"` · `2014` |
| `genres` | 장르 목록 | `["모험", "드라마", "SF"]` |
| `director` · `cast` | 감독 목록 · 주연 목록 (최대 5명) | `["크리스토퍼 놀란"]` |
| `overview` | 줄거리 | `"세계 각국의 정부와 경제가…"` |
| `runtime` | 상영 시간 (분) | `169` |
| `original_language` | 원어 — `"ko"`이면 한국 영화 | `"en"` |
| `production_countries` | 제작 국가 | `["United Kingdom", "United States of America"]` |
| `vote_average` · `vote_count` | TMDB 평점 · 평가 참여 수 | `8.485` · `40867` |
| `tmdb_url` | 원본 페이지 | `"https://www.themoviedb.org/movie/157336"` |

항목 하나를 색인 텍스트 하나로 만드는 것이 출발점입니다(F2002). 어떤 필드를 넣을지는 직접 정하고 이유를 남기세요.

```
예)  제목: 인터스텔라 (2014)
     장르: 모험, 드라마, SF
     감독: 크리스토퍼 놀란 / 출연: 매튜 매커너히, 앤 해서웨이 …
     줄거리: 세계 각국의 정부와 경제가 …
```

---

## movielab_wiki/

자세한 설명은 **`movielab_wiki/README.md`** 에 있습니다. 요약하면 다음과 같습니다.

```
movielab_wiki/
  wikipedia/{movie_id}_{문서제목}.json     문서 하나 = 파일 하나  예) 157336_웜홀.json
  wiki_manifest.json                       영화별 수집 이력 (색인에는 필요 없음)
  README.md
```

문서 JSON에는 `title` · `url`(근거 표시용 원문 링크) · `text`(본문) · `movie_id` · `related_movie` · `search_query` 등이 들어 있습니다.

> **청크 ID 주의** — 여러 영화가 같은 문서를 공유합니다(시리즈물, 같은 감독).
> `{page_id}:{순번}`처럼 영화를 빼고 만들면 뒤에 색인한 영화의 청크가 **오류 없이 조용히** 덮어써집니다.
> `{movie_id}:{page_id}:{순번}`처럼 영화 ID를 넣으세요.

---

## 숫자로 보면

| 항목 | 값 |
|---|---|
| 영화 | 964편 (한국 영화 168편) |
| 위키 문서 | 파일 3,725개 · 고유 문서 2,661건 · 영화당 1~10건 (평균 3.9건) |
| 용량 | `movies.json` 약 1.4MB · `movielab_wiki/` 약 57MB (압축 전) |
| 수집 시점 | 2026년 9월 (본문은 수집 당시 스냅샷) |

---

<a id="document-07"></a>

## 원본 문서: `example/live_codes_1021_streamlit_lab/README.md`

# Streamlit 실습 — 2회차 라이브 (1일차 09:00~11:00) · ✏️ 실습용

이 폴더의 파일을 순서대로 따라가면 **근거 기반 지식 서비스의 UI 골격**이 완성됩니다.
7단계 파일(`step7_skeleton.py`)이 오후부터 이어 쓸 **프로젝트 본 파일의 출발점**입니다. 남은 3일은 그 골격의 빈 칸을 채웁니다.

> HTML · CSS · JavaScript를 몰라도 됩니다. 파이썬만 씁니다.
> 각 단계에는 **비유**(전원)와 **한 걸음 더**(전공자 · 빠른 수강생)가 함께 있습니다. 한 걸음 더는 건너뛰어도 됩니다.

> **이 폴더는 실습용입니다.** 파일마다 `[실습 N]` 주석 자리가 비어 있고, 수업에서 강사와 함께 채웁니다.
> - 비어 있는 상태로도 실행됩니다. 하나 채울 때마다 저장하고 다시 실행해서 바뀐 것을 확인하세요.
> - 채울 곳은 편집기에서 `[실습`을 검색하면 바로 찾을 수 있습니다. 주석에 무엇을 쓰면 되는지 힌트가 있습니다.
> - 5 · 6 · 7단계 파일은 앞 단계 완성본에서 시작합니다. 앞 단계를 다 못 했어도 다음 단계로 넘어갈 수 있습니다.
> - 8단계(`step8_wiki_api.py`)는 실행만 해 보는 샘플이라 비어 있는 곳이 없습니다.
> - 완성본(정답 코드)은 수업이 끝난 뒤 받습니다.

---

## 시작하기 전에

```bash
python -m venv .venv
source .venv/Scripts/activate        # Windows (Git Bash) · macOS/Linux는 source .venv/bin/activate
pip install -r requirements.txt
```

`.env.example`을 복사해 **이 폴더의 `.env`** 를 만들고 값을 채웁니다. 0단계 스크립트, Streamlit 앱, 위키백과 샘플이 모두 이 파일 하나를 읽습니다.

```
GMS_KEY=발급받은_키
WIKI_CONTACT=your-email@example.com     # 8단계 · 프로젝트에서 사실상 필수 (영문 이메일)
```

> **키를 코드에 직접 쓰지 마세요.** `.env`는 형상관리에 올리지 않습니다.
> 키가 커밋되면 폐기하고 다시 발급받아야 합니다.

---

**각 단계는 앞 단계 위에 쌓입니다.** 새로 만들지 말고 이어서 고쳐 나가세요.

---

## 0단계 — LLM 연결 기초

```bash
python step0_llm.py              # Streamlit이 아니라 그냥 python으로 실행 — 결과는 터미널에 나온다
```

**채울 곳** `[실습 2]` ChatOpenAI 만들기 → 첫 호출 · `[실습 3]` 돌아온 것 들여다보기 · `[실습 4]` 메시지 목록으로 묻기 · `[실습 5]` 질문만 vs 대화 전체 · `[실습 +]` 토큰 비교(선택)

- [ ] 출력은 1~5 구간으로 나뉜다. 코드의 같은 번호 주석(`# ── 1. 키 읽기` …)과 짝지어 위에서 아래로 읽는다
- [ ] `load_dotenv()`로 키가 읽히는지 확인한다 (키 값은 출력하지 않는다)
- [ ] LLM을 한 번 호출해 응답을 받는다. `invoke()`가 돌려주는 것은 문자열이 아니라 **메시지 객체**다 (`.content`)
- [ ] `{"role", "content"}` 형식으로 대화를 넘겨 본다
- [ ] "대한민국의 수도는?" → "거기 인구는?" — 대화를 넘기지 않으면 되묻고, 넘기면 이어지는 것을 본다

**비유** 영화 〈메멘토〉의 주인공. 메모(대화 기록)를 함께 건네야 방금 무슨 일이 있었는지 압니다.
**한 걸음 더** GMS는 OpenAI와 같은 모양의 상태 없는(stateless) HTTP API입니다. 대화가 길수록 입력 토큰과 비용이 늘어납니다. 실행 결과 마지막 구간(한 걸음 더)에서 직접 확인합니다.

---

## 1단계 — 위젯은 값을 돌려준다

```bash
streamlit run step1_widgets.py
```

**채울 곳** `[실습 1]` 위젯 세 개 · `[실습 2]` 눌린 순간에만 인사 · `[실습 3]` 값 들여다보기

- [ ] 브라우저가 열리는지 확인한다. 파일을 고치고 저장하면 오른쪽 위에 `Rerun`이 뜨는 것도 본다
- [ ] 이름을 입력하고 장르를 고른 뒤 **인사하기**를 누른다
- [ ] `위젯이 돌려준 값 들여다보기`를 펼쳐 `name` · `genre` · `clicked` 값을 확인한다
- [ ] 인사하기를 누른 뒤 **이름을 바꿔 본다** — 인사말이 사라지는 것을 본다 (이유는 2단계)

**다 됐다는 신호** `name = st.text_input(...)` 한 줄이 "입력창을 그리고, 입력된 글자를 돌려준다"는 뜻임을 설명할 수 있다.

**비유** 위젯은 "기다리지 않는 `input()`"입니다. 버튼은 초인종 — 누른 그 순간에만 `True`입니다.

| 위젯 | 돌려주는 값 | 다시 만나는 곳 |
|---|---|---|
| `st.text_input` | 입력된 글자 (비어 있으면 `""`) | 4단계 `st.chat_input`과 비교 |
| `st.selectbox` | 고른 항목 | 7단계 항목 선택 |
| `st.button` | 방금 눌렸으면 `True` | 7단계 대화 지우기 |
| `st.expander` | 값 없음 — 접었다 펴는 영역 | 7단계 근거 목록 |

다른 위젯(`st.slider`, `st.checkbox`, `st.radio` …)도 쓰는 법이 같습니다. 필요할 때 [공식 문서](https://docs.streamlit.io/develop/api-reference)에서 찾아 씁니다.

---

## 2단계 — 다시 실행된다 ★ 가장 중요

```bash
streamlit run step2_rerun.py
```

**채울 곳** `[실습 1]` count 세 줄 — 다 쓰고 나서, 누르기 전에 예상부터

- [ ] 누르기 **전에** 예상한다 — 다섯 번 누르면 `count`는 몇이 될까?
- [ ] 실제로 다섯 번 누르고, 화면의 **실행 시각**이 매번 바뀌는 것을 본다

**다 됐다는 신호** `count`가 1을 넘지 못하는 이유를 한 문장으로 말할 수 있다. 1단계의 인사말이 사라진 이유도 같은 문장이다.

**알게 된 것** 버튼을 누르면 **파일 첫 줄부터 다시 실행된다.** `count = 0`을 또 지나간다.

**비유** 칠판을 다 지우고 처음부터 다시 쓰는 선생님.
**한 걸음 더** 요청마다 메서드가 처음부터 도는 웹 컨트롤러(예: Spring)와 같습니다. 지역 변수는 요청이 끝나면 사라집니다. 모바일 · React의 "상태가 바뀌면 다시 그린다(UI = f(state))"와도 닮았습니다.

| 궁금증 | 답 | 해결하는 단계 |
|---|---|---|
| 왜 변수가 초기화되지? | 다시 실행되니까 | 3단계 `session_state` |
| 왜 대화가 사라지지? | 다시 실행되니까 | 4단계 기록을 담아 두고 매번 다시 그린다 |
| 왜 LLM 클라이언트를 매번 만들지? | 다시 실행되니까 | 5단계 `@st.cache_resource` |

---

## 3단계 — 상태 저장

```bash
streamlit run step3_state.py
```

**채울 곳** `[실습 1]` 첫 실행에만 0 · `[실습 2]` 버튼으로 1 올리기 · `[실습 3]` 화면에 쓰기

- [ ] `st.session_state`에 `count`를 넣고 버튼으로 올려 본다
- [ ] 화면 아래에 출력되는 `session_state`의 내용을 확인한다
- [ ] **`if "count" not in st.session_state:` 줄을 지우고** 다시 눌러 본다

**다 됐다는 신호** 숫자가 쌓인다. 조건문을 지우면 왜 다시 0이 되는지 안다.

**비유** 브라우저 탭마다 하나씩 있는 사물함. 칠판은 지워져도 사물함 안은 남습니다.
**한 걸음 더** 자바의 `HttpSession`과 비슷합니다. 탭(세션)마다 따로이고, 서버를 다시 켜면 사라집니다. 오래 남길 데이터는 파일이나 DB에 둡니다.

> **가장 흔한 실수** — 첫 실행인지 확인하지 않고 매번 초기값으로 덮어쓰는 것.

---

## 4단계 — 채팅 화면 (에코 봇)

```bash
streamlit run step4_echo.py
```

**채울 곳** `[실습 1]` 기록 준비 · `[실습 2]` 대화 다시 그리기 · `[실습 3]` 입력창 · `[실습 4]` 기록에 넣고 그리기

- [ ] `st.chat_input`으로 입력을 받고, `st.chat_message`로 말풍선을 그린다
- [ ] 주고받은 메시지를 `session_state.messages`에 쌓는다
- [ ] **대화를 다시 그리는 반복문(`[실습 2]`)을 주석 처리하고** 두 번 입력해 본다 — 직전 한 쌍만 남는다

| 위젯 | 하는 일 |
|---|---|
| `st.chat_input("...")` | 화면 아래 고정 입력창. 입력하면 그 문자열을, 없으면 `None`을 돌려준다 |
| `st.chat_message("user")` | 말풍선. `"user"` 또는 `"assistant"` |

**비유** 카톡방을 열면 앱이 지난 대화를 처음부터 다시 그립니다.
**한 걸음 더** 화면을 직접 고치지 않고 상태(`messages` 목록)만 고칩니다. 화면은 매번 상태로부터 그립니다. `messages`의 모양 `{"role", "content"}`는 0단계 LLM 대화 형식과 같습니다 — 6단계에서 그대로 넘깁니다.

---

## 5단계 — LLM 연결

```bash
streamlit run step5_llm.py
```

**채울 곳** 4단계 완성본에서 시작합니다. `[실습 1]` ChatOpenAI 만들기 · `[실습 2]` `@st.cache_resource` · `[실습 3]` 에코 한 줄 → LLM 답

- [ ] 답변 한 줄을 `get_model().invoke(question).content`로 바꾼다
- [ ] `st.spinner`로 기다리는 동안 진행 표시를 띄운다
- [ ] `@st.cache_resource`를 **떼어 보고** 무엇이 달라지는지 본다

**비유** `@st.cache_resource`는 전화기를 매번 새로 개통하지 않고 한 번 개통한 것을 계속 쓰는 것입니다.
**한 걸음 더** `cache_resource`로 만든 객체는 모든 사용자가 함께 쓰는 싱글턴입니다. 사용자별 데이터는 `session_state`에 둡니다. (값을 복사해 주는 것은 `cache_data`)

| 증상 | 볼 곳 |
|---|---|
| `401 Unauthorized` | 키 — 오타 · 만료 |
| `404 Not Found` | 주소 — `base_url` |
| 키가 `None` | `.env` 위치, `load_dotenv()` 호출 여부 |
| 응답이 몇 초 걸림 | 정상. 여러 명이 동시에 호출하면 더 걸린다 |

> **프로젝트의 복선** — 완성된 앱은 첫 질문이 1~2분 걸립니다(문서 수집 · 색인). 진행 표시는 선택이 아니라 필수입니다. (F2012)

---

## 6단계 — 대화 맥락

```bash
streamlit run step6_context.py
```

**채울 곳** 5단계 완성본에서 시작합니다. `[실습 1]` payload 만들기 · `[실습 2]` question 대신 payload

- [ ] 먼저 **5단계 앱에서** 실패를 확인한다 — "대한민국의 수도는?" 다음 "거기 인구는?"
- [ ] `session_state.messages`를 system 메시지와 함께 통째로 넘긴다
- [ ] system 메시지의 말투를 바꿔 차이를 본다

**비유** system 메시지는 배우에게 주는 배역 설명서입니다.
**한 걸음 더** 대화가 길어지면 토큰이 늘고 컨텍스트 창에도 한계가 있습니다. 최근 N개만 보내기 · 앞부분 요약하기가 흔한 해법입니다. RAG가 문서를 통째로 넣지 않고 관련 있는 몇 조각(Top-k)만 넣는 이유도 같습니다.

---

## 7단계 — 프로젝트 골격 (여기서 프로젝트가 시작됩니다)

```bash
streamlit run step7_skeleton.py
```

**채울 곳** 코드를 보고 이해하고 주석을 남겨 보자.

### 도전 과제 — 위젯의 정체성(key) · 전공자 · 빠른 수강생

```bash
streamlit run plus_widget_key.py
```

**채울 곳** `[도전]` 해결 버전(`key` + 콜백)을 직접 만든다

"추천 버튼을 누르면 사이드바 선택도 바뀌게" 하려고 selectbox의 `index`를 지금 선택값으로 계산하면,
목록에서 고른 값이 **한 번 무시되는** 함정이 생깁니다. 참고 구현 검증에서 실제로 나온 결함입니다.
함정 버전과 해결 버전(`key` + 콜백)을 비교하고, 차이를 한 문장으로 설명해 보세요.

---

## 8단계 — 위키백과 API 맛보기 (터미널)

```bash
python step8_wiki_api.py
python step8_wiki_api.py "인터스텔라"
```

**채울 곳** 없음 — 실행만 해 보는 샘플입니다

- [ ] 검색어를 바꿔 가며 결과를 본다 — **관련 없는 문서가 얼마나 섞이는지** 확인한다
- [ ] 받은 본문 길이와 원문 URL을 확인한다. 없는 제목이면 `None`이 온다
- [ ] `.env`에 `WIKI_CONTACT`를 넣고 다시 실행한다 — 안내 문구가 사라진다

| User-Agent | 분당 요청 한도 (직접 측정) |
|---|---|
| 연락처 없음 `MovieLab/0.1 python-requests` | **10회** — 11번째 요청부터 `429` |
| 연락처 있음 `MovieLab/0.1 (your-email@example.com) python-requests` | **200회** |
| 한글 포함 | 요청을 보내기 전에 오류 — HTTP 헤더에는 영문만 |

## 파일 목록

| 파일 | 단계 |
|---|---|
| `requirements.txt` · `.env.example` | 준비 |
| `step0_llm.py` | 0. LLM 연결 기초 (터미널) |
| `step1_widgets.py` | 1. 위젯은 값을 돌려준다 |
| `step2_rerun.py` | 2. 다시 실행된다 |
| `step3_state.py` | 3. 상태 저장 |
| `step4_echo.py` | 4. 채팅 화면 |
| `step5_llm.py` | 5. LLM 연결 |
| `step6_context.py` | 6. 대화 맥락 |
| `step7_skeleton.py` | 7. 프로젝트 골격 |
| `plus_widget_key.py` | 도전 과제 — 위젯의 정체성(key) |
| `step8_wiki_api.py` | 8. 위키백과 API 맛보기 (터미널) |

---

<a id="document-08"></a>

## 원본 문서: `frontend/public/assets/models/ASSETS.md`

# Historical NASA asset integrity

These records cover retained original assets. Only New Horizons is still selected. Active replacements: SOURCES.md and COMMUNITY_ASSETS.md.

# Downloaded spacecraft model integrity

```json
{
  "file": "voyager.glb",
  "url": "https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/voyager-probe-(b)/Voyager%20Probe%20(B).glb",
  "bytes": 1720864,
  "sha256": "bd86ded828dd3f459293aee4ffc3cd0998d8db67439317c8299650a1174c3289",
  "extensionsRequired": [
    "KHR_draco_mesh_compression"
  ],
  "extensionsUsed": [
    "KHR_draco_mesh_compression",
    "EXT_texture_webp"
  ],
  "images": 4,
  "meshes": 4,
  "materials": 3
}
```

```json
{
  "file": "hubble.glb",
  "url": "https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/hubble-space-telescope-(b)/Hubble%20Space%20Telescope%20(B).glb",
  "bytes": 5140096,
  "sha256": "fc2690f5806bcbe39ea534735b0afea9bd268ab89203a05c46e8c418ceb88489",
  "extensionsRequired": [
    "KHR_draco_mesh_compression"
  ],
  "extensionsUsed": [
    "KHR_draco_mesh_compression"
  ],
  "images": 0,
  "meshes": 1308,
  "materials": 0
}
```

```json
{
  "file": "webb.glb",
  "url": "https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/james-webb-space-telescope-(b)/James%20Webb%20Space%20Telescope%20(B).glb",
  "bytes": 1004248,
  "sha256": "4958e61e5a564f2efcc32cd516b9d36ea0b9bc644f64dbcfe182ce8a422ae526",
  "extensionsRequired": [
    "KHR_draco_mesh_compression"
  ],
  "extensionsUsed": [
    "KHR_draco_mesh_compression"
  ],
  "images": 0,
  "meshes": 1,
  "materials": 36
}
```

```json
{
  "file": "new-horizons.glb",
  "url": "https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/n/New_Horizons.glb",
  "bytes": 3293532,
  "sha256": "cf152d8cea17c4a83711041cb0d29ca1d980bfafa084ada2656569ea92cdd73f",
  "extensionsRequired": [],
  "extensionsUsed": [],
  "images": 6,
  "meshes": 6,
  "materials": 6
}
```

```json
{
  "file": "juno.glb",
  "url": "https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/j/Juno.glb",
  "bytes": 9185648,
  "sha256": "d467c3164806aebfdf72c61a29e12851895d91a20cbb64b9653abb421f3193eb",
  "extensionsRequired": [],
  "extensionsUsed": [],
  "images": 11,
  "meshes": 14,
  "materials": 14
}
```

---

<a id="document-09"></a>

## 원본 문서: `frontend/public/assets/models/COMMUNITY_ASSETS.md`

# Active community asset integrity

```json
[
  {
    "target": "hubble",
    "title": "Hubble space telescope",
    "author": "Cybertron B-127",
    "source": "https://sketchfab.com/3d-models/e22236fab9634c959c0525c7ab9c83d7",
    "license": "CC BY 4.0",
    "images": 10,
    "meshes": 11,
    "extensionsRequired": [],
    "files": [
      {
        "path": "community/hubble/ATTRIBUTION.txt",
        "bytes": 334,
        "sha256": "626d83e606b7eb72ce2c530200bfdaa4ceef76a71d13664cdd588b7ae7c853b0"
      },
      {
        "path": "community/hubble/hubble.glb",
        "bytes": 11463124,
        "sha256": "e6a40640d6846e8f5d9438821ebe2d7de730c8dadba1cc9dfdbcc148ff1052cd"
      }
    ]
  },
  {
    "target": "iss",
    "title": "ISS - International Space Station.",
    "author": "rhuket",
    "source": "https://sketchfab.com/3d-models/33c72dd6671c40b3ae5bf90c917a6adb",
    "license": "CC BY 4.0",
    "images": 26,
    "meshes": 343,
    "extensionsRequired": [],
    "files": [
      {
        "path": "community/iss/ATTRIBUTION.txt",
        "bytes": 337,
        "sha256": "a31d2e6aececbedb3ae8ccd647d23ca6d2034e474c9917a0f5a08b7f35a8aec6"
      },
      {
        "path": "community/iss/license.txt",
        "bytes": 744,
        "sha256": "0da31f1c2836339eaf8e633dcd7f504703174512adb6a847cad16a6803550921"
      },
      {
        "path": "community/iss/scene.bin",
        "bytes": 13295932,
        "sha256": "0e8b2d0d571abd21eda2104ebc287e4ee182d840eec6c8378dd54c86ee805c81"
      },
      {
        "path": "community/iss/scene.gltf",
        "bytes": 553370,
        "sha256": "a6413414aa761bfc34f852c7b4358dfde2fbaed751f2ac0ec97faa5bce673bbd"
      },
      {
        "path": "community/iss/textures/ecostress_baseColor.jpeg",
        "bytes": 32187,
        "sha256": "b12462ed8ada965ed19755a178d055623e5335ceaa7ed45cd18c406d134eaf9a"
      },
      {
        "path": "community/iss/textures/ecostress_dexter_baseColor.jpeg",
        "bytes": 462874,
        "sha256": "3526e6912fae051edf2cb81aab3d7c7deaab76be76c8406181b3079af4c34c41"
      },
      {
        "path": "community/iss/textures/ecostress_metal_baseColor.jpeg",
        "bytes": 32187,
        "sha256": "b12462ed8ada965ed19755a178d055623e5335ceaa7ed45cd18c406d134eaf9a"
      },
      {
        "path": "community/iss/textures/foil_silver_normal.jpeg",
        "bytes": 105489,
        "sha256": "589d59715c2ae213588695514477554ca641e093e98eaf780b58e3a48a378be9"
      },
      {
        "path": "community/iss/textures/ISS_01_dark_baseColor.jpeg",
        "bytes": 462874,
        "sha256": "3526e6912fae051edf2cb81aab3d7c7deaab76be76c8406181b3079af4c34c41"
      },
      {
        "path": "community/iss/textures/ISS_01_dull_baseColor.jpeg",
        "bytes": 462874,
        "sha256": "3526e6912fae051edf2cb81aab3d7c7deaab76be76c8406181b3079af4c34c41"
      },
      {
        "path": "community/iss/textures/ISS_01_shiny_n_baseColor.jpeg",
        "bytes": 462874,
        "sha256": "3526e6912fae051edf2cb81aab3d7c7deaab76be76c8406181b3079af4c34c41"
      },
      {
        "path": "community/iss/textures/ISS_01_shiny_n_normal.jpeg",
        "bytes": 204249,
        "sha256": "b4c399987b65f440ab6d97768005f2ad4ccba006b11eb44f9610aba9ef61a835"
      },
      {
        "path": "community/iss/textures/ISS_02_dark_baseColor.jpeg",
        "bytes": 375338,
        "sha256": "721926e15133c09676171c20266e4b807ef0a8e217e0fde1d0772e45c3ddb640"
      },
      {
        "path": "community/iss/textures/ISS_02_dull_baseColor.jpeg",
        "bytes": 375338,
        "sha256": "721926e15133c09676171c20266e4b807ef0a8e217e0fde1d0772e45c3ddb640"
      },
      {
        "path": "community/iss/textures/ISS_03_dull_001_baseColor.jpeg",
        "bytes": 394576,
        "sha256": "6abd274e5601949bb18e5932310fc8eb27dd8bc7401abdc85c265ac273efd215"
      },
      {
        "path": "community/iss/textures/ISS_03_dull_002_baseColor.jpeg",
        "bytes": 406948,
        "sha256": "c0ab514ffae834b62b6028fc4464edf166656eae75e46b1af45fe5f0289273df"
      },
      {
        "path": "community/iss/textures/ISS_03_dull_baseColor.jpeg",
        "bytes": 391798,
        "sha256": "ea9c75fcec38266acaf561d141300e9be2edffa72733bc32b78b9f607feeefdf"
      },
      {
        "path": "community/iss/textures/ISS_03_shiny_n_baseColor.jpeg",
        "bytes": 391798,
        "sha256": "ea9c75fcec38266acaf561d141300e9be2edffa72733bc32b78b9f607feeefdf"
      },
      {
        "path": "community/iss/textures/ISS_03_shiny_n_normal.jpeg",
        "bytes": 195936,
        "sha256": "e02ce715a2cdacfab6266829c6201af1ef1ea4056c965602b86aca6215f1980d"
      },
      {
        "path": "community/iss/textures/ISS_04_dull_baseColor.jpeg",
        "bytes": 356534,
        "sha256": "cae4bf40530fb999c2217749cf14aed96ecac86d0e3e3712b66545ccfcf6daec"
      },
      {
        "path": "community/iss/textures/ISS_AO_01_baseColor.jpeg",
        "bytes": 362611,
        "sha256": "fadee44ec6ef7a39e9b080df5d542e880bc48317cb9459da3f91f99b54e5d47e"
      },
      {
        "path": "community/iss/textures/ISS_AO_02_baseColor.jpeg",
        "bytes": 498818,
        "sha256": "2234efb1b6538ae60f85ef51cef30dc38eb1bd58bbeabf04c5a667ea38f55638"
      },
      {
        "path": "community/iss/textures/ISS_AO_03_baseColor.jpeg",
        "bytes": 487275,
        "sha256": "9f2022ab163c9e5be72d57011ab068c6a457d4c52fe7f19e7329d4d2b5b708ee"
      },
      {
        "path": "community/iss/textures/ISS_AO_04_baseColor.jpeg",
        "bytes": 478412,
        "sha256": "e852c3f966425b8a8451ff11c1c7db67876924b5045294c8804ba9f97e15e0a0"
      },
      {
        "path": "community/iss/textures/ISS_AO_05_baseColor.jpeg",
        "bytes": 444033,
        "sha256": "de1c157f6b3979b11998351a5ec3ef06681d8e5ff6234e194d095a25fb09fe35"
      },
      {
        "path": "community/iss/textures/ISS_AO_06_baseColor.jpeg",
        "bytes": 460520,
        "sha256": "68ed9d69215aa91597db7ce2833c8136a1171dafe640ae5b15a8bf1ca8d91ba6"
      },
      {
        "path": "community/iss/textures/ISS_AO_07_baseColor.jpeg",
        "bytes": 406352,
        "sha256": "206460ea3529d136bfb583a294c8dfb6edc93edb027f254f5f2c468a43075068"
      },
      {
        "path": "community/iss/textures/ISS_AO_08_baseColor.jpeg",
        "bytes": 140854,
        "sha256": "3c540ddac2968d8c83860183c0f9c503d07db30aef2e5df470dd6f8b674de3f8"
      },
      {
        "path": "community/iss/textures/shiny_panel_baseColor.jpeg",
        "bytes": 375338,
        "sha256": "721926e15133c09676171c20266e4b807ef0a8e217e0fde1d0772e45c3ddb640"
      },
      {
        "path": "community/iss/textures/white_normal.jpeg",
        "bytes": 132899,
        "sha256": "47df0dbdda104086843df26f43c7331e2fa7a331a1683012dccc4a39dd569bea"
      }
    ]
  },
  {
    "target": "voyager",
    "title": "Voyager 1&2",
    "author": "Sheikh Miah (package credit: Your Local Loser)",
    "source": "https://sketchfab.com/3d-models/edac5c8bbbec4321b49bff0da2ca4fda",
    "license": "CC BY 4.0",
    "images": 0,
    "meshes": 14,
    "extensionsRequired": [],
    "files": [
      {
        "path": "community/voyager/ATTRIBUTION.txt",
        "bytes": 354,
        "sha256": "b7069c4ca057fb4987b4cc01ed95292fd71b9e4fa8f9d5ab1ed08696762ae059"
      },
      {
        "path": "community/voyager/license.txt",
        "bytes": 690,
        "sha256": "1e1dd0cb52a13d74be463d84821f08acd879240b961d7aaf4da42f82b885f1d9"
      },
      {
        "path": "community/voyager/scene.bin",
        "bytes": 1196860,
        "sha256": "c34539a7777e549565dc8bbc935a0794d66e2a6c52bbd57c168c93d66ef6922e"
      },
      {
        "path": "community/voyager/scene.gltf",
        "bytes": 25493,
        "sha256": "a5c43f7eecc9e5767dbca4acff903201f77bdcc9f2cb10b9cafed4526f614ed3"
      }
    ]
  },
  {
    "target": "webb",
    "title": "James Webb Space Telescope",
    "author": "Isaac Kishibe",
    "source": "https://sketchfab.com/3d-models/c5addca8cba14edfa346fda22442bc37",
    "license": "CC BY 4.0",
    "images": 7,
    "meshes": 88,
    "extensionsRequired": [],
    "files": [
      {
        "path": "community/webb/ATTRIBUTION.txt",
        "bytes": 336,
        "sha256": "27781c724ae5021bfa6cb1d519c0b647caf7fa745319cb34b576c57139370089"
      },
      {
        "path": "community/webb/license.txt",
        "bytes": 744,
        "sha256": "95cbc5e762b5248b7a15cd8430f14abaebe7a71b34d99f72bd9af5baba3e37e4"
      },
      {
        "path": "community/webb/scene.bin",
        "bytes": 1195612,
        "sha256": "dd6b000557cf63ff1497cc6a8e5903143e97eef1539b881c365f6797e378196b"
      },
      {
        "path": "community/webb/scene.gltf",
        "bytes": 175971,
        "sha256": "5bd51f86423daeeb53977f945c0923ccc2c95fc21343abd8ce175d16062a6cf7"
      },
      {
        "path": "community/webb/textures/bat_lp_baseColor.jpeg",
        "bytes": 1102611,
        "sha256": "33edd896e041fd2f2ed7609a71c2dcfdcc505b77c283a94fb5c39ae17088154a"
      },
      {
        "path": "community/webb/textures/bat_lp_metallicRoughness.png",
        "bytes": 1574986,
        "sha256": "8847042b2a7c8fbaac48dc163a68f4afbcce13478f048d90a176832eaf2a8219"
      },
      {
        "path": "community/webb/textures/bat_lp_normal.png",
        "bytes": 6043216,
        "sha256": "01f430d92e8ab100a916b71d0c1e621fa2cb079f235d695b1409300ac8bbd833"
      },
      {
        "path": "community/webb/textures/black_metal_baseColor.png",
        "bytes": 1159710,
        "sha256": "00777000cc4ff3ec63c4e1fa513360952a215e16106b7a64175f721b4187a7cf"
      },
      {
        "path": "community/webb/textures/gold_glass_baseColor.png",
        "bytes": 1313,
        "sha256": "055726e881e4acd9df5d65ee89387365c70a3d155ae60a3182977ccae3fcb8ed"
      },
      {
        "path": "community/webb/textures/material_normal.png",
        "bytes": 3509372,
        "sha256": "bac56753bff443cad3543e8b180a432fe5b6db60d1e5f9c3b22e1d57950be41e"
      },
      {
        "path": "community/webb/textures/plane_low_normal.png",
        "bytes": 3898128,
        "sha256": "d57b68219090c21f0bc0ff72bd0a5edc4d9cd7e9a8c07468eb2feff9eed8e2e5"
      }
    ]
  },
  {
    "target": "juno",
    "title": "Juno OBJ Transparent",
    "author": "mbrennan; NASA/JPL-Caltech source",
    "source": "https://sketchfab.com/3d-models/6b37230169d44874998e0ddcb106ca8e",
    "license": "CC BY 4.0",
    "images": 7,
    "meshes": 10,
    "extensionsRequired": [],
    "files": [
      {
        "path": "community/juno/ATTRIBUTION.txt",
        "bytes": 350,
        "sha256": "432e99588c4a37157ef2f10f66483371dd5ef4d997c4ef11659e5c29ba2cb078"
      },
      {
        "path": "community/juno/license.txt",
        "bytes": 700,
        "sha256": "794725c7da0e329b03188eb2c8f3ef87453efde369fbe1a76ca795539ea79948"
      },
      {
        "path": "community/juno/scene.bin",
        "bytes": 960420,
        "sha256": "67a8b1bb7d2d84b5b249e28fc9aa71b78d291ce17cddc52596b2df794939d3b3"
      },
      {
        "path": "community/juno/scene.gltf",
        "bytes": 18459,
        "sha256": "0e9f4e81dbd9c7b1901b3cb4ed1d4cdc5a3f0789267e9ded6d328d8cd75f5d74"
      },
      {
        "path": "community/juno/textures/black_krinkle_baseColor.png",
        "bytes": 157105,
        "sha256": "6362f729a3f5b06a95130c37a74935f8be160318eec21d1784f973bcfcf26ee0"
      },
      {
        "path": "community/juno/textures/foil_ant_baseColor.png",
        "bytes": 127517,
        "sha256": "9f8515b05f4c34e98dc12a0d7700442218e7e1fafed804759a959efbc95c6351"
      },
      {
        "path": "community/juno/textures/foil_gold_baseColor.png",
        "bytes": 564442,
        "sha256": "5009ca2a934a249a830627220787919b02627c4e3ae2658a2acf1984b7da105b"
      },
      {
        "path": "community/juno/textures/foil_silver_baseColor.png",
        "bytes": 180709,
        "sha256": "8d1e450b43eb7390b9d8e56f91bbcaa6059151178f767ced296ababf59b490fc"
      },
      {
        "path": "community/juno/textures/shiny_panels_baseColor.png",
        "bytes": 3625769,
        "sha256": "df987c128b0856675cc0b5e67399261e1f85f6e4f885741b048208ba79d6dc3d"
      },
      {
        "path": "community/juno/textures/solar_panels_baseColor.png",
        "bytes": 1087950,
        "sha256": "ac1a08092c483384772b78f71279b3e5bb560850ae6a350cd30b0aa5249cce70"
      },
      {
        "path": "community/juno/textures/tex_01_baseColor.png",
        "bytes": 1014549,
        "sha256": "0a16e3472c789cab67412454cf928b82d571066c136ea60f6143f9fa854aeffe"
      }
    ]
  },
  {
    "target": "tiangong",
    "title": "tianGong",
    "author": "w29572227",
    "source": "https://sketchfab.com/3d-models/tiangong-aca22b1dd6d242c1ae7b88de2f483b77",
    "license": "CC BY 4.0",
    "images": 1,
    "meshes": 471,
    "extensionsRequired": [],
    "triangles": 997206,
    "optimization": "weld; simplify ratio=.2 error=.0005; prune; dedup",
    "files": [
      {
        "path": "community/tiangong/ATTRIBUTION.txt",
        "bytes": 1099,
        "sha256": "734d14c2ac5433c6cf4a3cbfba644edee59f27478852bc76082dafe44206bd87"
      },
      {
        "path": "community/tiangong/license.txt",
        "bytes": 656,
        "sha256": "d3166a0b1af73cf5575fb845ccd3cc3cb6d0f7e582374af903f0a8f7d1a643d3"
      },
      {
        "path": "community/tiangong/scene.bin",
        "bytes": 18944872,
        "sha256": "1695c3779ef74ff8a22ef3a1500a39e51a9817b652bfa89fb3e111df0f009b06"
      },
      {
        "path": "community/tiangong/scene.gltf",
        "bytes": 792970,
        "sha256": "2841c837872aa91090de25b164c129ef73eb3a893bdab9d99f6fe7d551654631"
      },
      {
        "path": "community/tiangong/textures/flag.001_baseColor.png",
        "bytes": 81851,
        "sha256": "33b9eef39870154a1d7e3aaa69b551dd11036450a1cd9849c2efa93d26e40433"
      }
    ],
    "appearance": "ISS-inspired muted panel and hull colors, revised metalness/roughness, no hull emission; original flag texture retained"
  }
]
```

---

<a id="document-10"></a>

## 원본 문서: `frontend/public/assets/models/draco/README.md`

# Draco 3D Data Compression

Draco is an open-source library for compressing and decompressing 3D geometric meshes and point clouds. It is intended to improve the storage and transmission of 3D graphics.

[Website](https://google.github.io/draco/) | [GitHub](https://github.com/google/draco)

## Contents

This folder contains three utilities:

* `draco_decoder.js` — Emscripten-compiled decoder, compatible with any modern browser.
* `draco_decoder.wasm` — WebAssembly decoder, compatible with newer browsers and devices.
* `draco_wasm_wrapper.js` — JavaScript wrapper for the WASM decoder.

Each file is provided in two variations:

* **Default:** Latest stable builds, tracking the project's [master branch](https://github.com/google/draco).
* **glTF:** Builds targeted by the [glTF mesh compression extension](https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_draco_mesh_compression), tracking the [corresponding Draco branch](https://github.com/google/draco/tree/gltf_2.0_draco_extension).

Either variation may be used with `THREE.DRACOLoader`:

```js
var dracoLoader = new THREE.DRACOLoader();
dracoLoader.setDecoderPath('path/to/decoders/');
dracoLoader.setDecoderConfig({type: 'js'}); // (Optional) Override detection of WASM support.
```

Further [documentation on GitHub](https://github.com/google/draco/tree/master/javascript/example#static-loading-javascript-decoder).

## License

[Apache License 2.0](https://github.com/google/draco/blob/master/LICENSE)

---

<a id="document-11"></a>

## 원본 문서: `frontend/public/assets/models/LEGACY_NASA_SOURCES.md`

# Historical NASA assets (only New Horizons remains active)

# Spacecraft models

## Applied: ISS

- File: `iss.glb` (472,488 bytes, edited)
- Source: NASA / Michael D. Carbajal, International Space Station (ISS) (B)
- Page: https://science.nasa.gov/3d-resources/international-space-station-iss-b/
- Download: https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/international-space-station-(iss)-(b)/International%20Space%20Station%20(ISS)%20(B).glb
- Original SHA-256: `2ba4427413b0dd89a33d2acaf962dea8a96a3b1d8dceda05cc7aad547ffd3d16`
- Edited SHA-256: `00f7207e9ebdb95a5fb983a288f8441d29a71dfa4427d47d728a5b6be12bae37`
- Terms: https://www.nasa.gov/nasa-brand-center/images-and-media/
- Downloaded 2026-10-22. No NASA endorsement is implied.
- Edited 2026-10-22: removed `bendedtrus`, `bendedtru1`-`bendedtru3`,
  `pCylinder1`, `pCylinder2`, `pCylinder8` nodes/meshes and their animation channels.
  Remaining: `polySurfa1`, `polySurfa2`, `polySurfa3`. Surviving animation references
  were remapped. Draco binary data is unchanged (unused data is retained).
- Runtime centers/scales the remaining model and adapts materials to
  the scene's Phong shading. Orientation is illustrative, not live ISS attitude.
- Geometry requires Draco decompression. Local decoder files in `draco/` are
  copied from the installed Three.js 0.140.0 glTF decoder distribution.
  Draco uses Apache-2.0; see `draco/LICENSE` and `draco/README.md`.

## Additional applied models (2026-10-22)

Voyager 1 and 2 share one source asset, cloned as independently selectable instances.
NASA models listed below are now applied except Tiangong, which remains a sphere.
Download URLs, sizes and SHA-256 hashes are recorded in `ASSETS.md`.
All retain the NASA media usage guidelines linked above.


| Target | Source | Notes |
|---|---|---|
| Voyager 1 / 2 | https://science.nasa.gov/3d-resources/voyager-probe-b/ | Applied `voyager.glb`; spacecraft file, not antenna-only file |
| New Horizons | https://science.nasa.gov/resource/new-horizons-3d-model/ | Applied `new-horizons.glb`; NASA/VTAD |
| Juno | https://science.nasa.gov/resource/juno-3d-model/ | Applied `juno.glb`; NASA/VTAD |
| Hubble | https://science.nasa.gov/3d-resources/hubble-space-telescope-b/ | Applied `hubble.glb`; compatible static meshes batched at load time |
| James Webb | https://science.nasa.gov/3d-resources/james-webb-space-telescope-b/ | Applied `webb.glb`; NASA/Christopher R. Meaney |
| Tiangong | https://www.turbosquid.com/FullPreview/Index.cfm/ID/2451571 | Model exists; page lists free download, Editorial Uses Only, FBX/MAX, high polygon count. Web asset redistribution terms must be checked before integration. |
| Tiangong alternative | https://makerworld.com/tr/models/391596-space-station-tiangong-space-station-complete-draw?from=search | STL/CAD printing candidate; search listing indicates CC BY-NC. Download and exact license not independently verified. Conversion/optimization required. |

The Tiangong candidates refer to the modular station, not the earlier Tiangong-1
laboratory. A free download does not automatically authorize distributing the
source model as a public web asset. NASA candidates also retain their individual
credits and any third-party notices under NASA media guidelines.

All models preserve existing scene trajectories and marker positions. Display scale is
normalized using the existing radius values; attitude is illustrative, not telemetry.
Materials use the scene-compatible Phong shading with source colors and textures.
Hubble B has no source materials/textures; its neutral appearance comes from the source.

---

<a id="document-12"></a>

## 원본 문서: `frontend/public/assets/models/natural/ASSETS.md`

# Natural-body assets and integrity

```json
[
  {
    "name": "Haumea",
    "source": "https://science.nasa.gov/resource/haumea-3d-model/",
    "credit": "NASA VTAD",
    "license": "NASA media usage guidelines https://www.nasa.gov/nasa-brand-center/images-and-media/",
    "texture": "Original NASA model UV-compatible color image and normal map; distant-body surface illustrative",
    "images": 2,
    "triangles": 960,
    "files": [
      {
        "path": "Haumea/ATTRIBUTION.txt",
        "bytes": 550,
        "sha256": "7f5461fcab3f6ad49b2d99137b6ce581b2377300e600181e639c3541c93d1d43"
      },
      {
        "path": "Haumea/baseColor_1.png",
        "bytes": 1633693,
        "sha256": "418c0951302de235e77ac26f06396b3c40acb97230c9adc42302a2a3bb8c309e"
      },
      {
        "path": "Haumea/normal_1.png",
        "bytes": 9676344,
        "sha256": "75fb1d8276c23273497fd3b88c651993066aa705d662e999ed567346b2313a94"
      },
      {
        "path": "Haumea/scene.bin",
        "bytes": 23648,
        "sha256": "bf4a86d0e54dba35759341cf01bc85b3533d715a8fba3dbe126eb964f8e61b37"
      },
      {
        "path": "Haumea/scene.gltf",
        "bytes": 2343,
        "sha256": "fc2e4349f7fc4eeb92d5464a455f1f0edf19f1b6de83b81ed1f9b92e4147bc61"
      }
    ]
  },
  {
    "name": "Phobos",
    "source": "https://science.nasa.gov/resource/phobos-mars-moon-3d-model/",
    "credit": "NASA/JPL-Caltech",
    "license": "NASA media usage guidelines https://www.nasa.gov/nasa-brand-center/images-and-media/",
    "texture": "Original NASA model UV-compatible color image",
    "images": 1,
    "triangles": 32040,
    "files": [
      {
        "path": "Phobos/ATTRIBUTION.txt",
        "bytes": 511,
        "sha256": "5155d49b169977790792f4535b45ddf062a54dc6cb007579c98735a961a76947"
      },
      {
        "path": "Phobos/baseColor.png",
        "bytes": 3135097,
        "sha256": "a65ae92f44afd7f15ab4c1c01576eb325b5af2db166b5338c8394b48685d3a48"
      },
      {
        "path": "Phobos/scene.bin",
        "bytes": 718608,
        "sha256": "095f30d1525c77c5e229437c96ee3864bf90d178a0e7e8d5daaab37c57cc469e"
      },
      {
        "path": "Phobos/scene.gltf",
        "bytes": 2235,
        "sha256": "db19fa5c13b59fc4b8fabf591f5ff482a73010c0d4c6f88ac9a0f086f55a85f6"
      }
    ]
  },
  {
    "name": "Deimos",
    "source": "https://science.nasa.gov/resource/deimos-mars-moon-3d-model/",
    "credit": "NASA/JPL-Caltech",
    "license": "NASA media usage guidelines https://www.nasa.gov/nasa-brand-center/images-and-media/",
    "texture": "Original NASA model UV-compatible color image",
    "images": 1,
    "triangles": 32512,
    "files": [
      {
        "path": "Deimos/ATTRIBUTION.txt",
        "bytes": 511,
        "sha256": "d53a1908916ed79662f5bf813e208033ea8c91675f24b2a6a738491921d55be8"
      },
      {
        "path": "Deimos/baseColor.png",
        "bytes": 870867,
        "sha256": "0035f14138a54ea14e3884eae564af16f3f5501c626062b10732e17bab762a92"
      },
      {
        "path": "Deimos/scene.bin",
        "bytes": 727840,
        "sha256": "ef46c969b0942df788b922d4030ec1f14584a37c2dda2b67d434096eb710b960"
      },
      {
        "path": "Deimos/scene.gltf",
        "bytes": 2231,
        "sha256": "54cdd561df8d19ae0caac8f77f0a03121649f276921a044150dc7601673425d1"
      }
    ]
  },
  {
    "name": "ChuryumovGerasimenko",
    "source": "https://commons.wikimedia.org/wiki/File:67P-Churyumov-Gerasimenko.stl",
    "credit": "ESA/Rosetta/NAVCAM",
    "license": "CC BY-SA 3.0 IGO https://creativecommons.org/licenses/by-sa/3.0/igo/",
    "triangles": 104192,
    "referenceRadius": 1.6496236671125608,
    "texture": "Shared original procedural regolith and normal map (CC0); not observed imagery",
    "images": 2,
    "files": [
      {
        "path": "ChuryumovGerasimenko/ATTRIBUTION.txt",
        "bytes": 538,
        "sha256": "aff027d125fac169e9f62b394a2899ba9637ada05068ad96b7eef702d7fdacd5"
      },
      {
        "path": "ChuryumovGerasimenko/scene.bin",
        "bytes": 2924864,
        "sha256": "5c61648660157c00d1ac2165a498828033e3cba92e599b0be1f670bcc582fad4"
      },
      {
        "path": "ChuryumovGerasimenko/scene.gltf",
        "bytes": 3019,
        "sha256": "731670819d0870a14ccac16565895962c523beb11831a9d05e4dfa655241c13d"
      }
    ]
  },
  {
    "name": "Pan",
    "source": "https://sbn.psi.edu/pds/resource/saturnsatshapes.html",
    "credit": "Thomas, P.; Joseph, J.; Ansty, T. (2018), Saturn Small Moon Shape Models V1.0, doi:10.26033/ewy3-jy61; NASA/Cassini ISS",
    "license": "NASA-led mission scientific data, no restrictive notice in bundle; NASA Science Data License policy (CC0 default)",
    "triangles": 27468,
    "referenceRadius": 13.695564248855415,
    "texture": "Shared original procedural regolith and normal map (CC0); not observed imagery",
    "images": 2,
    "files": [
      {
        "path": "Pan/ATTRIBUTION.txt",
        "bytes": 651,
        "sha256": "a29e3d7c004551380e5d20982a3dd9dac59654770ae6abcac2c9c7695302f7fe"
      },
      {
        "path": "Pan/scene.bin",
        "bytes": 772496,
        "sha256": "9538c9217b1784903ca0178068729deabba1e8e8b0e8fd7acc6679b728b996cd"
      },
      {
        "path": "Pan/scene.gltf",
        "bytes": 3106,
        "sha256": "cef7a5586681e798c430039807242a6d37c2e2dce37343c499d18c357c55c1e2"
      }
    ]
  },
  {
    "name": "Atlas",
    "source": "https://sbn.psi.edu/pds/resource/saturnsatshapes.html",
    "credit": "Thomas, P.; Joseph, J.; Ansty, T. (2018), Saturn Small Moon Shape Models V1.0, doi:10.26033/ewy3-jy61; NASA/Cassini ISS",
    "license": "NASA-led mission scientific data, no restrictive notice in bundle; NASA Science Data License policy (CC0 default)",
    "triangles": 26990,
    "referenceRadius": 14.932947024575524,
    "texture": "Shared original procedural regolith and normal map (CC0); not observed imagery",
    "images": 2,
    "files": [
      {
        "path": "Atlas/ATTRIBUTION.txt",
        "bytes": 653,
        "sha256": "9435be1ac4a6bc898fa7e9ac922bd1f5e0e98395ee534e0bc00fc9d09aabc683"
      },
      {
        "path": "Atlas/scene.bin",
        "bytes": 759048,
        "sha256": "a8d1b8fb9f5dd6d5d5559f8832b18315b02429149a97d4d7006588a7f29b81de"
      },
      {
        "path": "Atlas/scene.gltf",
        "bytes": 3112,
        "sha256": "9188f3bad99e25f97a491adc7c4c484ce4535cddb10ba9fdececc0b3ab402fe7"
      }
    ]
  },
  {
    "name": "Hyperion",
    "source": "https://sbn.psi.edu/pds/resource/saturnsatshapes.html",
    "credit": "Thomas, P.; Joseph, J.; Ansty, T. (2018), Saturn Small Moon Shape Models V1.0, doi:10.26033/ewy3-jy61; NASA/Cassini ISS",
    "license": "NASA-led mission scientific data, no restrictive notice in bundle; NASA Science Data License policy (CC0 default)",
    "triangles": 29268,
    "referenceRadius": 136.25276925715926,
    "texture": "Shared original procedural regolith and normal map (CC0); not observed imagery",
    "images": 2,
    "files": [
      {
        "path": "Hyperion/ATTRIBUTION.txt",
        "bytes": 656,
        "sha256": "e4f3607420040206ee1298c3ecb0730cd68c1e45f9737c0e69e36c8d3563b2d8"
      },
      {
        "path": "Hyperion/scene.bin",
        "bytes": 822992,
        "sha256": "ba714d027c85ec6ec5dd9cb6051bd14d6a94a02a9f48f17c77a55efe1738422e"
      },
      {
        "path": "Hyperion/scene.gltf",
        "bytes": 3118,
        "sha256": "b80fd5900deb784f32c30f849005fb5eebf9e2c8d8fc45dbff2332caa84bd715"
      }
    ]
  },
  {
    "name": "Daphnis",
    "source": "https://sbn.psi.edu/pds/resource/saturnsatshapes.html",
    "credit": "Thomas, P.; Joseph, J.; Ansty, T. (2018), Saturn Small Moon Shape Models V1.0, doi:10.26033/ewy3-jy61; NASA/Cassini ISS",
    "license": "NASA-led mission scientific data, no restrictive notice in bundle; NASA Science Data License policy (CC0 default)",
    "triangles": 26926,
    "referenceRadius": 3.893385351662991,
    "texture": "Shared original procedural regolith and normal map (CC0); not observed imagery",
    "images": 2,
    "files": [
      {
        "path": "Daphnis/ATTRIBUTION.txt",
        "bytes": 655,
        "sha256": "b980a4db562f3968ed45ab173dd462f2dbffc84a541801e06ebc3b447765a429"
      },
      {
        "path": "Daphnis/scene.bin",
        "bytes": 757288,
        "sha256": "a034a3fec27bb37e1f53b5cee8a13a8cc38f4af66ea3153ec226401d73732c1f"
      },
      {
        "path": "Daphnis/scene.gltf",
        "bytes": 3112,
        "sha256": "42c6aff4bfbbbb7e0b0e5d5e69708e6b43bf2a5fe4bc723192486218153bae6b"
      }
    ]
  },
  {
    "name": "Prometheus",
    "source": "https://sbn.psi.edu/pds/resource/saturnsatshapes.html",
    "credit": "Thomas, P.; Joseph, J.; Ansty, T. (2018), Saturn Small Moon Shape Models V1.0, doi:10.26033/ewy3-jy61; NASA/Cassini ISS",
    "license": "NASA-led mission scientific data, no restrictive notice in bundle; NASA Science Data License policy (CC0 default)",
    "triangles": 28362,
    "referenceRadius": 42.76395860311274,
    "texture": "Shared original procedural regolith and normal map (CC0); not observed imagery",
    "images": 2,
    "files": [
      {
        "path": "Prometheus/ATTRIBUTION.txt",
        "bytes": 658,
        "sha256": "f91453382199e3c2226ae4dd474240f05d8e330c4fe1767e2b988c1c4573127a"
      },
      {
        "path": "Prometheus/scene.bin",
        "bytes": 797880,
        "sha256": "e67a7d87442dc87af56fba092c9e71119ea35e99227b1653cfa34d2343b97458"
      },
      {
        "path": "Prometheus/scene.gltf",
        "bytes": 3116,
        "sha256": "3ba4631e677473ca80c4cafa06d033b7e88d668d87b87af9d9dc3e7b5f69c78f"
      }
    ]
  },
  {
    "name": "Pandora",
    "source": "https://sbn.psi.edu/pds/resource/saturnsatshapes.html",
    "credit": "Thomas, P.; Joseph, J.; Ansty, T. (2018), Saturn Small Moon Shape Models V1.0, doi:10.26033/ewy3-jy61; NASA/Cassini ISS",
    "license": "NASA-led mission scientific data, no restrictive notice in bundle; NASA Science Data License policy (CC0 default)",
    "triangles": 27124,
    "referenceRadius": 40.034957436144026,
    "texture": "Shared original procedural regolith and normal map (CC0); not observed imagery",
    "images": 2,
    "files": [
      {
        "path": "Pandora/ATTRIBUTION.txt",
        "bytes": 655,
        "sha256": "a8c8b1f011bf6b2b9ddea93d7641f20703817afb7697ac3238365d99213b8aa2"
      },
      {
        "path": "Pandora/scene.bin",
        "bytes": 762864,
        "sha256": "9443fb0785d1da1097370c1f611dd9bdbaf5531410e40b8a908e068ef18a1f78"
      },
      {
        "path": "Pandora/scene.gltf",
        "bytes": 3111,
        "sha256": "7192034115a0a1627f47d153d31a56f2f105bec50b7bce87def361e0a5cd5459"
      }
    ]
  },
  {
    "name": "Epimetheus",
    "source": "https://sbn.psi.edu/pds/resource/saturnsatshapes.html",
    "credit": "Thomas, P.; Joseph, J.; Ansty, T. (2018), Saturn Small Moon Shape Models V1.0, doi:10.26033/ewy3-jy61; NASA/Cassini ISS",
    "license": "NASA-led mission scientific data, no restrictive notice in bundle; NASA Science Data License policy (CC0 default)",
    "triangles": 27826,
    "referenceRadius": 58.58700045686541,
    "texture": "Shared original procedural regolith and normal map (CC0); not observed imagery",
    "images": 2,
    "files": [
      {
        "path": "Epimetheus/ATTRIBUTION.txt",
        "bytes": 658,
        "sha256": "f8d6926cbbc13a9d3a286f7d75664761821e61fe43ad0dd045b031a779aa55ed"
      },
      {
        "path": "Epimetheus/scene.bin",
        "bytes": 782552,
        "sha256": "4ee60987f313453d62a37a0548248b9220a2ab6ff6f28104523ca3f5ed9c5c86"
      },
      {
        "path": "Epimetheus/scene.gltf",
        "bytes": 3113,
        "sha256": "5d796b5db35f58bde138bf0e687bf70cdb445e6e86dde09fdce69275c814be1f"
      }
    ]
  },
  {
    "name": "Janus",
    "source": "https://sbn.psi.edu/pds/resource/saturnsatshapes.html",
    "credit": "Thomas, P.; Joseph, J.; Ansty, T. (2018), Saturn Small Moon Shape Models V1.0, doi:10.26033/ewy3-jy61; NASA/Cassini ISS",
    "license": "NASA-led mission scientific data, no restrictive notice in bundle; NASA Science Data License policy (CC0 default)",
    "triangles": 26758,
    "referenceRadius": 88.98192826900373,
    "texture": "Shared original procedural regolith and normal map (CC0); not observed imagery",
    "images": 2,
    "files": [
      {
        "path": "Janus/ATTRIBUTION.txt",
        "bytes": 653,
        "sha256": "052a9e367e912c9f68ff5b891049a6affd2136e62d162f0c02b5169bdaa28dcf"
      },
      {
        "path": "Janus/scene.bin",
        "bytes": 752424,
        "sha256": "d96a2f58da4e0b196a8d14d001f7937b0502f53db750fdc84037ac1e7cb2778b"
      },
      {
        "path": "Janus/scene.gltf",
        "bytes": 3105,
        "sha256": "0d474da346c6f16ddb655b8818cd75f8e64ba2c4125b087351f88f8eea043dba"
      }
    ]
  },
  {
    "name": "Amalthea",
    "source": "https://sbn.psi.edu/pds/resource/stkshape.html",
    "credit": "Philip Stooke (2025), Stooke small bodies shape models V1.0, doi:10.26033/yt84-5y91; Voyager/Galileo/Giotto/Vega source observations",
    "license": "NASA PDS public scientific data; original raw numerical shape data, no restrictive notice in bundle; dataset citation retained",
    "triangles": 5040,
    "referenceRadius": 81.68141375580319,
    "texture": "Shared original procedural regolith and normal map (CC0); not observed imagery",
    "images": 2,
    "files": [
      {
        "path": "Amalthea/ATTRIBUTION.txt",
        "bytes": 675,
        "sha256": "37f5c3aa95e3555abcd0f4f116fa0c498c3a2457c31bf88e3029a16a1e120b04"
      },
      {
        "path": "Amalthea/scene.bin",
        "bytes": 142304,
        "sha256": "896b854855232397b59eafc54bd243c2ab8c51a9e5163edaf8370caa98f33d0c"
      },
      {
        "path": "Amalthea/scene.gltf",
        "bytes": 3109,
        "sha256": "cd7ef3847308f1a35d3747dbe95bdb17cd812e3c0d2a11aea48b968be1518e75"
      }
    ]
  },
  {
    "name": "Thebe",
    "source": "https://sbn.psi.edu/pds/resource/stkshape.html",
    "credit": "Philip Stooke (2025), Stooke small bodies shape models V1.0, doi:10.26033/yt84-5y91; Voyager/Galileo/Giotto/Vega source observations",
    "license": "NASA PDS public scientific data; original raw numerical shape data, no restrictive notice in bundle; dataset citation retained",
    "triangles": 5040,
    "referenceRadius": 45.546698081639256,
    "texture": "Shared original procedural regolith and normal map (CC0); not observed imagery",
    "images": 2,
    "files": [
      {
        "path": "Thebe/ATTRIBUTION.txt",
        "bytes": 672,
        "sha256": "13421377cd7f262694c8beed7070f68d736bfb8c1baa17f35a1f714bf42813a1"
      },
      {
        "path": "Thebe/scene.bin",
        "bytes": 142304,
        "sha256": "5f155a1e19de2aec983c1761946760ba9e187133accd0b67e2023f0bcdf5aa35"
      },
      {
        "path": "Thebe/scene.gltf",
        "bytes": 3103,
        "sha256": "1608cad6adf327e7ef773de6f37d48a8acfcacf27abc5de8f46489fe976eaf48"
      }
    ]
  },
  {
    "name": "Proteus",
    "source": "https://sbn.psi.edu/pds/resource/stkshape.html",
    "credit": "Philip Stooke (2025), Stooke small bodies shape models V1.0, doi:10.26033/yt84-5y91; Voyager/Galileo/Giotto/Vega source observations",
    "license": "NASA PDS public scientific data; original raw numerical shape data, no restrictive notice in bundle; dataset citation retained",
    "triangles": 5040,
    "referenceRadius": 201.0029187511098,
    "texture": "Shared original procedural regolith and normal map (CC0); not observed imagery",
    "images": 2,
    "files": [
      {
        "path": "Proteus/ATTRIBUTION.txt",
        "bytes": 674,
        "sha256": "1102058de756423847b365ef8792594e365449842b2f38180bb6c5aab6861672"
      },
      {
        "path": "Proteus/scene.bin",
        "bytes": 142304,
        "sha256": "bd2f453c9695beb441a1bc453909e489dae25e4826f6e1cb41521719c3f29443"
      },
      {
        "path": "Proteus/scene.gltf",
        "bytes": 3119,
        "sha256": "8ffc553226432829e35fb914a52d2c3b3617ac09ee48305279cbbe7609f3f4a8"
      }
    ]
  },
  {
    "name": "Larissa",
    "source": "https://sbn.psi.edu/pds/resource/stkshape.html",
    "credit": "Philip Stooke (2025), Stooke small bodies shape models V1.0, doi:10.26033/yt84-5y91; Voyager/Galileo/Giotto/Vega source observations",
    "license": "NASA PDS public scientific data; original raw numerical shape data, no restrictive notice in bundle; dataset citation retained",
    "triangles": 5040,
    "referenceRadius": 94.56545287589375,
    "texture": "Shared original procedural regolith and normal map (CC0); not observed imagery",
    "images": 2,
    "files": [
      {
        "path": "Larissa/ATTRIBUTION.txt",
        "bytes": 674,
        "sha256": "edd6537d44b35f67d9614f8aecd6c84587a478a1c2b564f940aec37d00d44f6d"
      },
      {
        "path": "Larissa/scene.bin",
        "bytes": 142304,
        "sha256": "a5d8b4b6d013ab03e93930872a1e80ab2057a302910bb7158be9b9a2374f14b6"
      },
      {
        "path": "Larissa/scene.gltf",
        "bytes": 3092,
        "sha256": "b5100caebb98a848d064965e7569942f4054423b3ddad26b790e892564553c0a"
      }
    ]
  },
  {
    "name": "Halley",
    "source": "https://sbn.psi.edu/pds/resource/stkshape.html",
    "credit": "Philip Stooke (2025), Stooke small bodies shape models V1.0, doi:10.26033/yt84-5y91; Voyager/Galileo/Giotto/Vega source observations",
    "license": "NASA PDS public scientific data; original raw numerical shape data, no restrictive notice in bundle; dataset citation retained",
    "triangles": 5040,
    "referenceRadius": 4.57906433330178,
    "texture": "Shared original procedural regolith and normal map (CC0); not observed imagery",
    "images": 2,
    "files": [
      {
        "path": "Halley/ATTRIBUTION.txt",
        "bytes": 673,
        "sha256": "a36b3deb336cd5c9e3e9d0a19e0ea0f13e0a1fb41308c5d2fbbcec6b395c68e6"
      },
      {
        "path": "Halley/scene.bin",
        "bytes": 142304,
        "sha256": "930a3b60d9c957c5d48e1aabe8a63029780573709ea287dc33cceaeab7993fb9"
      },
      {
        "path": "Halley/scene.gltf",
        "bytes": 3118,
        "sha256": "2b253461ee9eb1e34ffc32461b83326dc5945d98363370bb44a15886011b6dc3"
      }
    ]
  },
  {
    "name": "Nix",
    "source": "https://doi.org/10.6084/m9.figshare.12779948.v1",
    "credit": "Simon Porter (2021); NASA New Horizons Project",
    "license": "CC BY 4.0 https://creativecommons.org/licenses/by/4.0/",
    "triangles": 80000,
    "referenceRadius": 36.53120777553474,
    "texture": "Shared original procedural regolith and normal map (CC0); not observed imagery",
    "images": 2,
    "files": [
      {
        "path": "Nix/ATTRIBUTION.txt",
        "bytes": 513,
        "sha256": "69639a0819cfb566aa36bd3d27ef737f402e0ae32b2e3df6e61a1edc9ca9f711"
      },
      {
        "path": "Nix/scene.bin",
        "bytes": 2246816,
        "sha256": "0cdce086d6cf9dcd9a85f163ecf25d2ae13e0ab6d709d123be577e3ae19a0b71"
      },
      {
        "path": "Nix/scene.gltf",
        "bytes": 2968,
        "sha256": "d30422dfbfd2b0d32f40ddd6eebc49a4cc8ed8af9e546135147051166ad9a55a"
      }
    ]
  }
]
```

## Shared original procedural textures

- surface.png: 272970 bytes, SHA-256 `71d8fe41ebfdcb0dd7aaf521e7030baeb0855f474c7b72b93034dc053626b3c6`
- surface-normal.png: 646840 bytes, SHA-256 `2729a161e7423eed0a422be1ffae1eed3d6c75b4aa144bf87b521f4f64f593c6`

---

<a id="document-13"></a>

## 원본 문서: `frontend/public/assets/models/natural/CREDITS.md`

# Natural body model credits

18 models replace spherical visual approximations in both display modes. Existing orbits, category visibility, labels, selection and comet tails are retained. Catalog mean radii scale the volume-equivalent reference radius of each model; attitudes remain illustrative.

## Rights and provenance

- NASA media models: original per-resource credit retained, used for educational/informational web visualization under https://www.nasa.gov/nasa-brand-center/images-and-media/ . No NASA endorsement implied. Haumea surface detail is illustrative, not resolved spacecraft imagery.
- NASA PDS shape data: downloaded original Saturn and Stooke scientific bundles; inspected XML/TXT notices and retained dataset citations. No restrictive copyright/license notice was found in these bundles. NASA mission data policy: https://science.data.nasa.gov/about/license . Cassini shape data falls under the NASA-led mission data default (CC0 absent restrictive notice). Stooke numerical models are cited as public PDS scientific shape data; they are not relabeled as a separately granted CC license.
- 67P geometry: ESA/Rosetta/NAVCAM, CC BY-SA 3.0 IGO https://creativecommons.org/licenses/by-sa/3.0/igo/ . Official archive was unavailable, so its license-reviewed Wikimedia mirror was used. The converted geometry and its adaptation are distributed under the same license. Downloadable glTF and binary remain openly accessible alongside this document.
- Nix geometry: Simon Porter (2021), CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ . Original Figshare dataset https://doi.org/10.6084/m9.figshare.12779948.v1 .
- Shared surface.png and surface-normal.png: original Solar Atlas procedural textures, CC0 1.0 https://creativecommons.org/publicdomain/zero/1.0/ . They are illustrative regolith grain, not photographs or scientific surface reconstructions. No previously installed Fandom/NC texture atlases are reused on these models.

## Modifications

NASA models: GLB to glTF conversion, original image bytes and UVs retained, material set to rough non-metallic regolith, reference-radius metadata added. Other models: source Z-north to Y-north rotation, normals computed, spherical UV seam split, original procedural color/normal maps applied. Stooke 5-degree radial grids triangulated, duplicate polar radii averaged. ESA/Nix STL vertices welded without geometry decimation. Color tint is an approximate visual choice. Neither the invented grain nor rotational attitude is claimed as measured.

## Assets

| Body | Model source and credit | Terms | Texture |
|---|---|---|---|
| Haumea | [NASA VTAD](https://science.nasa.gov/resource/haumea-3d-model/) | NASA media usage guidelines https://www.nasa.gov/nasa-brand-center/images-and-media/ | Original NASA model UV-compatible color image and normal map; distant-body surface illustrative |
| Phobos | [NASA/JPL-Caltech](https://science.nasa.gov/resource/phobos-mars-moon-3d-model/) | NASA media usage guidelines https://www.nasa.gov/nasa-brand-center/images-and-media/ | Original NASA model UV-compatible color image |
| Deimos | [NASA/JPL-Caltech](https://science.nasa.gov/resource/deimos-mars-moon-3d-model/) | NASA media usage guidelines https://www.nasa.gov/nasa-brand-center/images-and-media/ | Original NASA model UV-compatible color image |
| ChuryumovGerasimenko | [ESA/Rosetta/NAVCAM](https://commons.wikimedia.org/wiki/File:67P-Churyumov-Gerasimenko.stl) | CC BY-SA 3.0 IGO https://creativecommons.org/licenses/by-sa/3.0/igo/ | Shared original procedural regolith and normal map (CC0); not observed imagery |
| Pan | [Thomas, P.; Joseph, J.; Ansty, T. (2018), Saturn Small Moon Shape Models V1.0, doi:10.26033/ewy3-jy61; NASA/Cassini ISS](https://sbn.psi.edu/pds/resource/saturnsatshapes.html) | NASA-led mission scientific data, no restrictive notice in bundle; NASA Science Data License policy (CC0 default) | Shared original procedural regolith and normal map (CC0); not observed imagery |
| Atlas | [Thomas, P.; Joseph, J.; Ansty, T. (2018), Saturn Small Moon Shape Models V1.0, doi:10.26033/ewy3-jy61; NASA/Cassini ISS](https://sbn.psi.edu/pds/resource/saturnsatshapes.html) | NASA-led mission scientific data, no restrictive notice in bundle; NASA Science Data License policy (CC0 default) | Shared original procedural regolith and normal map (CC0); not observed imagery |
| Hyperion | [Thomas, P.; Joseph, J.; Ansty, T. (2018), Saturn Small Moon Shape Models V1.0, doi:10.26033/ewy3-jy61; NASA/Cassini ISS](https://sbn.psi.edu/pds/resource/saturnsatshapes.html) | NASA-led mission scientific data, no restrictive notice in bundle; NASA Science Data License policy (CC0 default) | Shared original procedural regolith and normal map (CC0); not observed imagery |
| Daphnis | [Thomas, P.; Joseph, J.; Ansty, T. (2018), Saturn Small Moon Shape Models V1.0, doi:10.26033/ewy3-jy61; NASA/Cassini ISS](https://sbn.psi.edu/pds/resource/saturnsatshapes.html) | NASA-led mission scientific data, no restrictive notice in bundle; NASA Science Data License policy (CC0 default) | Shared original procedural regolith and normal map (CC0); not observed imagery |
| Prometheus | [Thomas, P.; Joseph, J.; Ansty, T. (2018), Saturn Small Moon Shape Models V1.0, doi:10.26033/ewy3-jy61; NASA/Cassini ISS](https://sbn.psi.edu/pds/resource/saturnsatshapes.html) | NASA-led mission scientific data, no restrictive notice in bundle; NASA Science Data License policy (CC0 default) | Shared original procedural regolith and normal map (CC0); not observed imagery |
| Pandora | [Thomas, P.; Joseph, J.; Ansty, T. (2018), Saturn Small Moon Shape Models V1.0, doi:10.26033/ewy3-jy61; NASA/Cassini ISS](https://sbn.psi.edu/pds/resource/saturnsatshapes.html) | NASA-led mission scientific data, no restrictive notice in bundle; NASA Science Data License policy (CC0 default) | Shared original procedural regolith and normal map (CC0); not observed imagery |
| Epimetheus | [Thomas, P.; Joseph, J.; Ansty, T. (2018), Saturn Small Moon Shape Models V1.0, doi:10.26033/ewy3-jy61; NASA/Cassini ISS](https://sbn.psi.edu/pds/resource/saturnsatshapes.html) | NASA-led mission scientific data, no restrictive notice in bundle; NASA Science Data License policy (CC0 default) | Shared original procedural regolith and normal map (CC0); not observed imagery |
| Janus | [Thomas, P.; Joseph, J.; Ansty, T. (2018), Saturn Small Moon Shape Models V1.0, doi:10.26033/ewy3-jy61; NASA/Cassini ISS](https://sbn.psi.edu/pds/resource/saturnsatshapes.html) | NASA-led mission scientific data, no restrictive notice in bundle; NASA Science Data License policy (CC0 default) | Shared original procedural regolith and normal map (CC0); not observed imagery |
| Amalthea | [Philip Stooke (2025), Stooke small bodies shape models V1.0, doi:10.26033/yt84-5y91; Voyager/Galileo/Giotto/Vega source observations](https://sbn.psi.edu/pds/resource/stkshape.html) | NASA PDS public scientific data; original raw numerical shape data, no restrictive notice in bundle; dataset citation retained | Shared original procedural regolith and normal map (CC0); not observed imagery |
| Thebe | [Philip Stooke (2025), Stooke small bodies shape models V1.0, doi:10.26033/yt84-5y91; Voyager/Galileo/Giotto/Vega source observations](https://sbn.psi.edu/pds/resource/stkshape.html) | NASA PDS public scientific data; original raw numerical shape data, no restrictive notice in bundle; dataset citation retained | Shared original procedural regolith and normal map (CC0); not observed imagery |
| Proteus | [Philip Stooke (2025), Stooke small bodies shape models V1.0, doi:10.26033/yt84-5y91; Voyager/Galileo/Giotto/Vega source observations](https://sbn.psi.edu/pds/resource/stkshape.html) | NASA PDS public scientific data; original raw numerical shape data, no restrictive notice in bundle; dataset citation retained | Shared original procedural regolith and normal map (CC0); not observed imagery |
| Larissa | [Philip Stooke (2025), Stooke small bodies shape models V1.0, doi:10.26033/yt84-5y91; Voyager/Galileo/Giotto/Vega source observations](https://sbn.psi.edu/pds/resource/stkshape.html) | NASA PDS public scientific data; original raw numerical shape data, no restrictive notice in bundle; dataset citation retained | Shared original procedural regolith and normal map (CC0); not observed imagery |
| Halley | [Philip Stooke (2025), Stooke small bodies shape models V1.0, doi:10.26033/yt84-5y91; Voyager/Galileo/Giotto/Vega source observations](https://sbn.psi.edu/pds/resource/stkshape.html) | NASA PDS public scientific data; original raw numerical shape data, no restrictive notice in bundle; dataset citation retained | Shared original procedural regolith and normal map (CC0); not observed imagery |
| Nix | [Simon Porter (2021); NASA New Horizons Project](https://doi.org/10.6084/m9.figshare.12779948.v1) | CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ | Shared original procedural regolith and normal map (CC0); not observed imagery |

Per-file sizes and SHA-256 hashes: ASSETS.md. Each model folder contains ATTRIBUTION.txt.

---

<a id="document-14"></a>

## 원본 문서: `frontend/public/assets/models/natural/VALIDATION.md`

# Asset validation (2026-10-22)

- Khronos glTF Validator: all 18 assets, 0 errors. 16 assets emit the standard generated-tangent-space warning because normal-map tangents are generated by the renderer; Three.js supports this path. Phobos and Deimos: 0 warnings.
- All glTF binary/image references resolve inside natural/; buffer byte lengths match. All image files decode.
- Positive volume-equivalent reference radii; source shape bounds visually inspected through point-cloud projections of representative bodies.
- JavaScript and unit-test source syntax checked. Tests were added/updated for natural-body reference-radius scaling, spacecraft-only environment lighting and both display modes.
- Application build, unit suite and live browser rendering were not run, respecting the established user-run workflow.

User commands from frontend/: npm run test -- tests/unit/spacecraftModel.test.js tests/unit/naturalBodyModels.test.js ; npm run build

---

<a id="document-15"></a>

## 원본 문서: `frontend/public/assets/models/SOURCES.md`

# Active spacecraft assets

ISS, Tiangong, Hubble, James Webb, Juno and Voyager 1/2 now use the community assets below. New Horizons keeps the accepted `new-horizons.glb` (NASA/VTAD).

All community assets are offered under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ . Their individual bundled credits are retained. Attribution reflects source listings; no endorsement is implied.

- **Hubble space telescope** by Cybertron B-127: https://sketchfab.com/3d-models/e22236fab9634c959c0525c7ab9c83d7 — 10 image textures; `hubble`.
- **ISS - International Space Station.** by rhuket: https://sketchfab.com/3d-models/33c72dd6671c40b3ae5bf90c917a6adb — 26 image textures; `iss`.
- **Voyager 1&2** by Sheikh Miah (package credit: Your Local Loser): https://sketchfab.com/3d-models/edac5c8bbbec4321b49bff0da2ca4fda — 0 image textures; `voyager`.
- **James Webb Space Telescope** by Isaac Kishibe: https://sketchfab.com/3d-models/c5addca8cba14edfa346fda22442bc37 — 7 image textures; `webb`.
- **Juno OBJ Transparent** by mbrennan; NASA/JPL-Caltech source: https://sketchfab.com/3d-models/6b37230169d44874998e0ddcb106ca8e — 7 image textures; `juno`.

Hubble textures are embedded in its GLB; other textured assets keep their original glTF, binary and texture files together. Voyager has colored materials but no image textures. Juno is a NASA Eyes-derived reprocessing explicitly accepted for this project. Webb is an illustrative model, not an exact engineering replica. Models are centered and uniformly scaled at runtime; source PBR materials are retained with procedural spacecraft-only environment reflections. Attitude is illustrative.

The old ISS seven-mesh removal applies only to the historical NASA asset; the replacement ISS uses its own complete geometry. Old NASA assets remain on disk but are not selected except New Horizons. Historical provenance: `LEGACY_NASA_SOURCES.md` and `ASSETS.md`. New file sizes and SHA-256: `COMMUNITY_ASSETS.md`. User-visible attribution: `CREDITS.html`.


## Tiangong (2026-10-22)

- tianGong by [w29572227](https://sketchfab.com/w29572227), [source](https://sketchfab.com/3d-models/tiangong-aca22b1dd6d242c1ae7b88de2f483b77), CC BY 4.0. Current modular station, not Tiangong-1.
- Official converted glTF download. 1 original flag image texture; other surfaces retain source PBR materials. Image bytes are unchanged.
- Web optimization: glTF Transform weld, meshoptimizer simplify (ratio .2, error .0005), prune, dedup: 4,425,408 to 997,206 triangles. Geometry is a simplified derivative, not the unchanged original. Full attribution and hashes are stored alongside the asset and in COMMUNITY_ASSETS.md.
- Existing orbit, scale modes, selection and labels use the same model integration as the other spacecraft.

2026-10-22 appearance adjustment: ISS-inspired desaturated charcoal solar cells, muted bronze panel frames and warm off-white/silver hull. Metalness/roughness tuned to ISS material ranges; removed white hull emissive factor. Original geometry, UVs and flag texture unchanged. ISS texture atlases are not reused because their UV layout differs.


## Natural bodies

18 scientific shape models are integrated separately from spacecraft materials. Full sources, modifications, texture classification and per-asset terms: [natural/CREDITS.md](#document-13). Checksums: natural/ASSETS.md.

---

<a id="document-16"></a>

## 원본 문서: `frontend/public/assets/planet-texture-maps/CREDITS.md`

# Planet Texture Maps Wiki texture credits

These maps are credited by the source wiki under CC BY-NC-SA 4.0 (non-commercial, attribution, share-alike).
Source: https://planet-texture-maps.fandom.com/wiki/Planet_Texture_Maps_Wiki

Some maps are fictional, partly fictional, or incomplete reconstructions. The source classification is retained below.
Existing high-resolution planet/Earth/Moon textures are not replaced.
2K means 2000 or 2048 pixels wide. If no 2K option existed, the smallest suitable original map was selected.
Files are the original CDN responses, served as WebP; no local resizing or editing was performed.

| Body | File | Size | Creator | Owner | Source classification | License | Source page |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Metis | [metis_2000.webp](frontend/public/assets/planet-texture-maps/metis_2000.webp) | 2000 × 1000 | PH0805_1 | Caltech/JPL/USGS | (fictitious) | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Metis) |
| Adrastea | [adrastea_2048.webp](frontend/public/assets/planet-texture-maps/adrastea_2048.webp) | 2048 × 1024 | ZEEKYHBOMBGUY1234 | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Adrastea) |
| Amalthea | [amalthea_2048.webp](frontend/public/assets/planet-texture-maps/amalthea_2048.webp) | 2048 × 1024 | Digital Hourglass | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Amalthea) |
| Thebe | [thebe_2048.webp](frontend/public/assets/planet-texture-maps/thebe_2048.webp) | 2048 × 1024 | Digital Hourglass | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Thebe) |
| Io | [io_2048.webp](frontend/public/assets/planet-texture-maps/io_2048.webp) | 2048 × 1024 | Digital Hourglass | (various) | semi-fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Io) |
| Europa | [europa_2048.webp](frontend/public/assets/planet-texture-maps/europa_2048.webp) | 2048 × 1024 | Digital Hourglass | (various) | semi-fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Europa) |
| Ganymede | [ganymede_2048.webp](frontend/public/assets/planet-texture-maps/ganymede_2048.webp) | 2048 × 1024 | Digital Hourglass | (various) | semi-fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Ganymede) |
| Callisto | [callisto_2048.webp](frontend/public/assets/planet-texture-maps/callisto_2048.webp) | 2048 × 1024 | Digital Hourglass | (various) | semi-fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Callisto) |
| Pan | [pan_1264.webp](frontend/public/assets/planet-texture-maps/pan_1264.webp) | 1264 × 632 | ZEEKYHBOMBGUY1234 | (various) | semi-realistic | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Pan) |
| Hyperion | [hyperion_2048.webp](frontend/public/assets/planet-texture-maps/hyperion_2048.webp) | 2048 × 1024 | Digital Hourglass | (various) | semi-fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Hyperion) |
| Daphnis | [daphnis_1024.webp](frontend/public/assets/planet-texture-maps/daphnis_1024.webp) | 1024 × 512 | ZEEKYHBOMBGUY1234 | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Daphnis) |
| Atlas | [atlas_1024.webp](frontend/public/assets/planet-texture-maps/atlas_1024.webp) | 1024 × 512 | ZEEKYHBOMBGUY1234 | (various) | semi-fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Atlas) |
| Prometheus | [prometheus_1440.webp](frontend/public/assets/planet-texture-maps/prometheus_1440.webp) | 1440 × 720 | ZEEKYHBOMBGUY1234 | (various) | semi-fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Prometheus) |
| Pandora | [pandora_1264.webp](frontend/public/assets/planet-texture-maps/pandora_1264.webp) | 1264 × 632 | ZEEKYHBOMBGUY1234 | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Pandora) |
| Epimetheus | [epimetheus_2048.webp](frontend/public/assets/planet-texture-maps/epimetheus_2048.webp) | 2048 × 1024 | Digital Hourglass | (various) | semi-fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Epimetheus) |
| Janus | [janus_2048.webp](frontend/public/assets/planet-texture-maps/janus_2048.webp) | 2048 × 1024 | ZEEKYHBOMBGUY1234 | (various) | semi-fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Janus) |
| Mimas | [mimas_1024.webp](frontend/public/assets/planet-texture-maps/mimas_1024.webp) | 1024 × 512 | Venus | NASA/USGS | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Mimas) |
| Enceladus | [enceladus_2048.webp](frontend/public/assets/planet-texture-maps/enceladus_2048.webp) | 2048 × 1024 | Venus | NASA | semi-realistic | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Enceladus) |
| Tethys | [tethys_1024.webp](frontend/public/assets/planet-texture-maps/tethys_1024.webp) | 1024 × 512 | ILikeSaturn | NASA/USGS | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Tethys) |
| Dione | [dione_1024.webp](frontend/public/assets/planet-texture-maps/dione_1024.webp) | 1024 × 512 | Maris/RedShift | Caltech/JPL/USGS | Voyager | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Dione) |
| Rhea | [rhea_720.webp](frontend/public/assets/planet-texture-maps/rhea_720.webp) | 720 × 360 | ILikeSaturn | NASA | Voyager | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Rhea) |
| Titan | [titan_2000.webp](frontend/public/assets/planet-texture-maps/titan_2000.webp) | 2000 × 1000 | Venus | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Titan) |
| Iapetus | [iapetus_1024.webp](frontend/public/assets/planet-texture-maps/iapetus_1024.webp) | 1024 × 512 | Maris/RedShift | Caltech/JPL/USGS | Voyager | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Iapetus) |
| Ariel | [ariel_1024.webp](frontend/public/assets/planet-texture-maps/ariel_1024.webp) | 1024 × 512 | Venus | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Ariel) |
| Miranda | [miranda_2048.webp](frontend/public/assets/planet-texture-maps/miranda_2048.webp) | 2048 × 1024 | ZEEKYHBOMBGUY1234 | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Miranda) |
| Oberon | [oberon_1024.webp](frontend/public/assets/planet-texture-maps/oberon_1024.webp) | 1024 × 512 | Venus | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Oberon) |
| Puck | [puck_2048.webp](frontend/public/assets/planet-texture-maps/puck_2048.webp) | 2048 × 1024 | ZEEKYHBOMBGUY1234 | NASA, Hubble, Voyager 2 | Voyager 2, NASA | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Puck) |
| Titania | [titania_1024.webp](frontend/public/assets/planet-texture-maps/titania_1024.webp) | 1024 × 512 | Maris/RedShift | Caltech/JPL/USGS | Voyager | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Titania) |
| Umbriel | [umbriel_1024.webp](frontend/public/assets/planet-texture-maps/umbriel_1024.webp) | 1024 × 512 | Venus | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Umbriel) |
| Proteus | [proteus_2048.webp](frontend/public/assets/planet-texture-maps/proteus_2048.webp) | 2048 × 1024 | Venus | NASA | Voyager | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Proteus) |
| Triton | [triton_1024.webp](frontend/public/assets/planet-texture-maps/triton_1024.webp) | 1024 × 512 | Venus | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Triton) |
| Nereid | [nereid_1024.webp](frontend/public/assets/planet-texture-maps/nereid_1024.webp) | 1024 × 512 | Venus | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Nereid) |
| Charon | [charon_1024.webp](frontend/public/assets/planet-texture-maps/charon_1024.webp) | 1024 × 512 | Venus | (various) | semi-fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Charon) |
| Nix | [nix_1264.webp](frontend/public/assets/planet-texture-maps/nix_1264.webp) | 1264 × 632 | Kepppppler62f (Keppp) (Qwertygghehlhog) | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Nix) |
| Pluto | [pluto_2048.webp](frontend/public/assets/planet-texture-maps/pluto_2048.webp) | 2048 × 1024 | INOVE | INOVE | (various) | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Pluto) |
| Ceres | [ceres_2048.webp](frontend/public/assets/planet-texture-maps/ceres_2048.webp) | 2048 × 1024 | Digital Hourglass | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Ceres) |
| Eris | [eris_2048.webp](frontend/public/assets/planet-texture-maps/eris_2048.webp) | 2048 × 1024 | NASA | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Eris) |
| Haumea | [haumea_2048.webp](frontend/public/assets/planet-texture-maps/haumea_2048.webp) | 2048 × 1024 | Digital Hourglass | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Haumea) |
| Makemake | [makemake_2048.webp](frontend/public/assets/planet-texture-maps/makemake_2048.webp) | 2048 × 1024 | Digital Hourglass | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Makemake) |
| Sedna | [sedna_2048.webp](frontend/public/assets/planet-texture-maps/sedna_2048.webp) | 2048 × 1024 | Digital Hourglass | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Sedna) |
| Halley | [halley_3674.webp](frontend/public/assets/planet-texture-maps/halley_3674.webp) | 3674 × 1837 | ZEEKYHBOMBGUY1234 | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Halley%27s_Comet_(1P_Halley)) |
| Phobos | [phobos_2048.webp](frontend/public/assets/planet-texture-maps/phobos_2048.webp) | 2048 × 1024 | Digital Hourglass | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Phobos) |
| Deimos | [deimos_2048.webp](frontend/public/assets/planet-texture-maps/deimos_2048.webp) | 2048 × 1024 | Digital Hourglass | (various) | fictitious | [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [Source](https://planet-texture-maps.fandom.com/wiki/Deimos) |

## Unavailable in wiki search

Aegaeon, Larissa, Tempel1, HerschelRigollet, ChuryumovGerasimenko, Encke

Full download URLs and SHA-256 hashes are in credits.json.

---

<a id="document-17"></a>

## 원본 문서: `frontend/README.md`

# Model Solar System — Vue port

원본: https://github.com/nbetts/model-solar-system

로컬 원본 `model-solar-system_react`의 React 연결 계층을 Vue 3 + JavaScript로 이식했습니다. 원본 폴더는 수정하지 않았습니다. 원본 소스 기준 커밋은 `01b8ad5861275cedeaf5e49969918441fdc01fb8`입니다.

앱 소스, Vue 컴포넌트, 설정, 테스트는 모두 JavaScript입니다. 타입 선언 파일과 TypeScript 컴파일러·타입 검사 빌드 단계를 제거했습니다. `npm run build`는 `vite build`만 실행하며 `jsconfig.json`은 에디터의 경로 인식을 위한 설정입니다. 외부 라이브러리가 자체 배포하는 선언 파일은 라이브러리의 일부이며 앱 실행에 TypeScript 컴파일러를 사용하지 않습니다.

## 실행

검증 환경: Windows, Node.js 24.18.0, Chrome. Node.js 22.12 이상 또는 호환되는 최신 LTS를 사용하세요.

```powershell
cd C:\YSSAFY\SSAFY\AI_core_pjt\model_solar_system_vue
npm install
npm run dev
```

터미널에 출력된 Local 주소를 엽니다.

```powershell
npm run build
npm run preview
```

## 유지한 기능

- 원본 13개 천체: 태양, 8개 행성, 명왕성, 달, 포보스, 데이모스
- 재귀적인 위성 계층, 원형 궤도·공전·자전·기울기 및 토성 고리
- 마우스 회전·이동·확대/축소, 천체와 라벨 클릭 선택, 선택 천체 카메라 추적
- Labels, Orbits, Actual scale, Low/Med/High 품질, Simulation speed, Focused body, Reset settings
- 실제 크기 모드의 카메라 거리 표시
- 기존 localStorage 키를 이용한 설정 저장·복원
- 초기 로딩 및 시작 모달, Help/About, 원저자·GitHub Star 링크
- localStorage의 기존 showDebugInfo 값을 통한 Stats/축 디버그 표시
- GodRays/SelectiveBloom, 품질별 DPR·배경 해상도

**사용자 승인으로 제외한 기능은 전체 화면 전환뿐입니다.** Fullscreen 체크박스와 전환 코드는 포함하지 않았습니다.

설정 UI는 Vue 폼과 컴포넌트로 다시 작성했습니다. 아코디언 다중 열기·키보드 이동, 모달 Tab/Shift+Tab 포커스 유지·닫은 후 포커스 복원, 버튼/Esc/바깥 영역 클릭 닫기를 구현했습니다. Mantine과 완전히 같은 픽셀·전환 애니메이션을 보장하는 것은 아니지만, 화면 구조와 조작 항목은 대응시켰습니다.

## 기능 변경을 피하기 위해 유지한 원본 특성

- 프레임별 회전식을 그대로 사용합니다. 경과 시간(delta)에 따른 보정으로 바꾸지 않았습니다.
- 최초 공전 위상은 원본의 `Math.floor(Math.random() * Math.PI * 2)`입니다. 실제 날짜의 천체 위치를 계산하지 않습니다.
- 시작 품질은 저장된 값과 관계없이 원본처럼 항상 High입니다.
- 위성 추적·실제 크기의 큰 좌표·그림자·품질 관련 기존 문제를 개선 대상으로 삼지 않았습니다. 그림자는 원본처럼 비활성화되어 있습니다.
- Med의 SelectiveBloom에는 원본이 전달하지 않는 lights 옵션을 추가하지 않았습니다.
- `astronomicalBodyData.js`와 `getBodyNames.js`는 타입 선언만 제거한 원본 데이터·로직입니다. 물리 데이터, 정규화식, 보기 편한 크기, 이미지나 텍스처를 보정하지 않았습니다. `public/assets`는 원본 그대로입니다.
- About/시작 모달의 원본 소개 문구와 저자 표시, 기존 GitHub 링크를 유지했습니다. 따라서 소개 문구에는 원본 기술인 React가 그대로 표시됩니다.

Three.js 0.140.0, three-stdlib 2.10.1, postprocessing 6.26.3, stats.js 0.17.0, github-buttons 2.21.1은 원본 lockfile의 버전입니다. `.npmrc`의 `legacy-peer-deps=true`는 원본의 Three.js/postprocessing 버전 조합을 변경하지 않고 설치하기 위한 설정입니다. React 런타임은 프로덕션 의존성에 포함하지 않았습니다. Three 렌더러·컨트롤·후처리를 Vue의 mount/watch/unmount에서 관리합니다.

## 구조

```text
src/
  App.vue
  main.js
  style.css
  components/
    SolarCanvas.vue
    SettingsPanel.vue
    StartupModal.vue
  data/
    astronomicalBodyData.js    # 원본 데이터 값과 계산식 유지
    store.js                   # Vue 반응형 상태와 기존 저장 키
  scene/
    solarScene.js              # 렌더러·카메라·배경·후처리·이벤트
    astronomicalBody.js        # 원본 천체 계층·회전·추적
    orbitPath.js               # 원본 궤도 geometry
  utils/getBodyNames.js         # 원본 로직 유지
public/assets/                 # 원본 그대로
tests/unit/                    # 데이터와 geometry 호환성
tests/e2e/                     # 프로덕션 빌드의 Chrome 동작 검증
```

## 검증

```powershell
npm test
npm run build
npm run test:e2e
```

E2E는 설치된 Chrome을 사용합니다. 개발 서버 없이 `dist`를 Playwright 요청 라우팅으로 제공하여 실제 프로덕션 번들을 검증합니다. 고정된 천체 위상은 테스트에서만 사용하며 배포 코드에는 적용하지 않습니다. 로딩/모달, 포커스 순환, 설정·천체 선택, 품질/크기 전환, 저장·복원, 초기화, 모바일 크기와 숨겨진 디버그 설정을 확인합니다. 외부 음악 서비스의 가용성이나 실제 청취 결과는 자동 테스트가 보장하지 않습니다. 폰트·음악·GitHub 버튼은 원본과 같이 외부 서비스 및 브라우저 정책의 영향을 받습니다.

`work/`에는 JavaScript 전환 후 검증 스크린샷 등 임시 결과를 저장하며 배포 및 Git 추적 대상이 아닙니다. 이전 TypeScript 이식 때 생성했던 React 비교 복사본과 임시 참조 코드는 프로젝트 밖의 Codex 작업 영역으로 옮겨 보존했습니다. 원본 React 폴더는 변경하지 않았습니다.

기존 태양계 화면에 Django 채팅 API를 사용하는 하단 질문창과 최신 답변 표시를 추가했습니다.

## 화면 하단 질문창

현재 선택한 천체의 QID를 사용해 `POST /api/chat/`를 호출합니다.
화면에는 현재 천체의 최신 답변 하나만 표시하며, 새 질문을 보내면 이전 답변을 대체합니다.
답변 아래에서 실제 인용한 출처를 펼칠 수 있습니다. 로딩·오류·재시도를 지원하고,
천체를 바꾼 뒤 이전 요청이 도착해도 다른 천체의 답변으로 섞지 않습니다.
각 천체의 대화 UUID와 최신 답변은 페이지가 열려 있는 동안만 유지합니다.
전체 대화 기록은 Django에 저장하며 현재 화면에는 기록 목록을 표시하지 않습니다.

기본 백엔드 주소는 `http://127.0.0.1:8000`입니다. 변경하려면 frontend/.env에
`VITE_API_BASE_URL=http://다른주소:포트`를 지정하고 Vite를 다시 시작합니다.
이 값에는 `/api`를 붙이지 않습니다. `.env.example`을 참고하세요.
GMS 키를 프론트엔드 환경변수에 넣지 않습니다.

백엔드를 켜 둔 상태에서 frontend 터미널에서 실행합니다. 추가 패키지 설치는 없습니다.

```bash
npm run dev
```

질문이 처리 중일 때는 같은 천체의 중복 전송을 막습니다. 네트워크 응답을 놓쳐 재시도하면
동일 요청 ID를 사용하며, 처리 중인 요청은 저장된 turn 상태를 조회합니다.
명시적으로 실패한 답변은 새 요청 ID로 다시 보냅니다. 성공한 요청의
`conversation_id`를 다음 질문에 포함해 후속 질문 문맥을 유지합니다.
시작/도움말 모달이 열려 있을 때는 입력창을 숨깁니다.


## Chat conversation UI

Questions and answers accumulate in one thread across camera changes. Collapse keeps the thread; New conversation creates a separate thread. Previous conversations are indexed in this browser's localStorage (scoped to the API URL) and restored from Django's existing conversation/turn endpoints. This is a browser-local history list, not authenticated account-level ownership. Clearing browser storage removes its conversation index; server records are unaffected.

History is loaded in 20-turn pages. Pending request IDs are journaled before sending, allowing an interrupted first request to be checked after refresh without creating a duplicate request. Definitively failed attempts use a new request ID but retain one visible question. Saved-history reads do not invoke the model.

Message navigation matches registered scene names and aliases against actual question/answer text. Buttons reveal the selected body's category and its ancestors before focusing. Retrieval targets alone do not produce navigation buttons. Source links/excerpts remain attached to each answer.

Validation commands (frontend directory):

```bash
npm run test -- tests/unit/chatNavigation.test.js tests/unit/chatHistory.test.js tests/unit/chatSession.test.js
npm run build
```

---

<a id="document-18"></a>

## 원본 문서: `GIT_TRACKING.md`

# Git 파일 관리

이 프로젝트는 상위 SSAFY 저장소의 일부입니다. 상위 `.gitignore`의 `*.json`을
프로젝트 `.gitignore`에서 필요한 경로에 한해 해제합니다.

## 반드시 커밋할 것

- `catalog/solar_targets.json`: 크롤러, 색인 명령, 프론트가 공통 참조하는 70개 대상
- `frontend/package.json`, `package-lock.json`, `jsconfig.json`
- 소스 코드, `requirements.txt`, Django `migrations/*.py`
- `crawling/data/solar_v1/processed/*.json`: 다른 PC에서 재크롤링 없이 색인을 복원하는 입력
- `.gitignore`, 환경변수 예제(실제 키 없는 `.env.example`)
- 프론트 텍스처와 출처 문서

## 커밋하지 않을 것

- 실제 `.env` 및 `.env.*` (example/sample/template 제외)
- `venv`, `node_modules`, `dist`, 캐시, 테스트 결과, 임시 `work`
- Django SQLite DB, `backend/chroma_db`, `backend/rag_runtime`
- 수집 캐시·원본 중복본·천체별 재개 체크포인트

Chroma는 바이너리 인덱스이므로 Git 대신 processed JSON으로 재생성합니다.
재임베딩을 피하려면 서버를 종료한 상태에서 Chroma 저장 폴더 전체를 별도 전달합니다.
체크포인트는 Git에 없으므로 다른 PC에서 수집을 재개할 때는 원래 PC의 `items/`도
별도 전달하거나 다시 수집해야 합니다. 기존 processed JSON만으로 색인하는 데는 필요 없습니다.

## 다른 PC에서 복원

1. 공용 venv를 생성하고 루트 requirements를 설치합니다.
2. `crawling/.env`를 별도로 만들고 GMS_KEY, WIKI_CONTACT를 입력합니다.
3. backend에서 `python manage.py migrate`를 실행합니다.
4. `python manage.py index_solar --group all --dry-run`으로 입력을 확인합니다.
5. `python manage.py index_solar --group all`로 Chroma를 재생성합니다(GMS 사용량 발생).

## 커밋 전 확인 (프로젝트 루트, Git Bash)

```bash
git status --short -- .
git check-ignore -v catalog/solar_targets.json frontend/package.json frontend/package-lock.json crawling/data/solar_v1/processed/celestial_objects.json
git check-ignore -v crawling/.env backend/db.sqlite3 backend/chroma_db/chroma.sqlite3
git ls-files -- catalog frontend/package.json frontend/package-lock.json crawling/data/solar_v1/processed
```

첫 check-ignore에서 `!` 예외가 표시되는 것은 포함하도록 설정됐다는 뜻입니다.
실제 Git 추적 여부는 ls-files로 확인합니다. ignore를 수정해도 자동으로 커밋되지 않습니다.

이미 추적 중인 파일은 나중에 ignore해도 계속 추적됩니다. 위의 제외 대상이 이미
추적돼 있다면 목록을 먼저 검토한 다음 해당 경로에만 `git rm --cached`를 적용합니다.
프로젝트 전체에 `git rm -r --cached .`를 사용하지 마세요.


## Atlas 조건 탐색 카드

자연어 조건 탐색 질문은 메타데이터 컬렉션을 의미 검색한 뒤, 후보별 메타데이터와 외부 문서 청크를 근거로 선별합니다. 모든 조건에 대한 정확한 인용문이 검증된 결과만 짧은 부합 이유와 근거 번호를 포함한 카드로 표시합니다. 일반 설명·비교 질문은 기존 답변 경로를 사용합니다.

카드를 선택하면 숨겨진 천체를 표시하고 카메라를 이동한 다음 해당 천체의 마지막 전용 대화를 복원합니다. 기존 대화와 초안은 유지하며 카드 선택만으로 질문을 자동 전송하지 않습니다. 결과와 조건은 대화 결과 JSON에 저장되어 새로고침 후에도 복원됩니다.

“그중 …만” 같은 후속 탐색은 이전 결과 ID로 후보를 제한하고 이전 조건과 새 조건을 함께 검증합니다. 이전 결과는 과학적 근거로 재사용하지 않습니다. 결과가 없으면 자료 부족과 실제 부재를 구분해 안내합니다.

`backend/config/settings.py`의 `RAG_DISCOVERY_CANDIDATES`(기본 24)와 `RAG_DISCOVERY_BATCH_SIZE`(기본 8)로 후보 수와 선별 배치를 제한합니다. 후보가 제한된 경우 전체 목록이 아니라는 안내를 표시합니다. DB 마이그레이션이나 재인덱싱은 필요하지 않습니다.
