# TODO

2026-11-20 기준. 필수 F3001~F3019, NF3001~NF3007과 심화 F3022를 구현했다. 근거는 `docs/REQUIREMENT_TRACEABILITY.md`와 `docs/TEST_REPORT.md`에 있다.

## 완료

- [x] Horizons 관측자 천문력 파서와 실호출
- [x] Google Places 검색·상세, Horizons, Open-Meteo 실호출 검증 (`docs/API_VALIDATION.md`)
- [x] Places, 날씨 Tool과 실패 코드. 좌표·고도를 만들지 않음
- [x] 정보 수집, 질문 한도, 재계획 상한, 계획 저장 경고, 로그 세션 분리
- [x] Tool 호출 이벤트(이름, 소요시간, 성공 여부, 재사용)를 로깅 Agent가 저장
- [x] 심화 F3022: `search_knowledge` Tool과 `backend`의 `POST /api/knowledge/search/`
- [x] 화면: 진행 단계, Tool 호출 이력, 재계획 지점, 실패 안내, 근거 문서, 출처 표시
- [x] Routes 제외 (`PLANNER_ROUTES_ENABLED=false`). 이동시간은 추정하지 않음
- [x] 테스트: planner 50개, backend 114개(Django 전체), 프론트 단위 7개, Playwright 3개
- [x] 2차 코드(`backend/rag`, `crawling`)도 같은 방식으로 정리: 답변 생성은 `claude-haiku-5-5`(GMS Anthropic 경로, chat completions) 고정, Sol 승급 제거, 키는 루트 `.env` 하나
- [x] GMS 엔드포인트(`https://gms.ssafy.io/gmsapi/`)와 모델(`claude-haiku-5-5`)을 코드에 고정. 키만 `GMS_KEY` 환경변수로 받음
- [x] 대표 시나리오 6건 실행과 전체 로그 샘플 (`docs/samples/`)
- [x] 비기능 점검, 출처·이용 조건 문서, 셀프 체크리스트
- [x] README 정리, FastAPI `/docs` 화면 (`docs/openapi-docs.png`)
- [x] 화면 요청 ID 생성이 http 접속에서 실패하던 문제 수정

## 남은 일 (외부 조건 때문에 못 한 것)

- [x] GMS LLM(`claude-haiku-5-5`) 실호출 검증: 의도 분석, 작업 계획, 2차 답변 생성 (F3005, F3006). 시나리오 6건은 Haiku로 재실행 필요
- [ ] 임베딩을 Gemini(`gemini-embedding-2`, GMS Gemini 경로)로 바꿨다. 설정은 새 폴더 `backend/chroma_db_gemini`를 가리키며 아직 색인하지 않았다(3차 필수가 아니라 건너뜀). 필요하면 `python manage.py index_solar --include-english-originals` 로 색인한 뒤 `search_knowledge`의 실제 근거 문서 반환을 확인한다 (F3022). 이전 OpenAI 색인(`backend/chroma_db`)은 그대로 둔다.
- [ ] S4 정책 결정: 예보 범위를 넘는 날짜를 추정으로 계속할지, 먼저 안내하고 멈출지
- [ ] 자정을 넘는 시간대(예: 20:00~04:00) 처리 방식 결정. 지금은 되묻는다.
- [x] 2차 크롤링의 수집·번역 모델을 `claude-haiku-5-5`로 바꿨다(코드·테스트·실호출 확인). 기존 번역 데이터(`gpt-6-luna`)는 색인에서 계속 인정하고, 다시 수집하면 Haiku로 새로 만든다.
- [ ] Google Routes의 빈 응답(`{}`) 원인을 찾으면 `PLANNER_ROUTES_ENABLED=true`로 켜고 이동시간 제한을 검증한다.
- [ ] Horizons와 Open-Meteo가 키 없는 API여도 "외부 API 3종" 조건에 인정되는지 강사에게 확인한다.

## 알려진 개선 후보

- 실패 원인이 날짜(예보 범위 밖)인데도 재계획이 장소·시간 축을 3회까지 바꾼다. 원인을 보고 재계획을 줄일 수 있다.
- 자정을 넘는 시간대(예: 22:00~05:00)는 바로 받지 않고 되묻는다.
- `frontend/src/components/PlannerPanel.vue`와 `frontend/src/api/planner.js`중 `PlannerPanel.vue`는 예전 플래너 화면으로, 지금은 `PlannerView`가 쓰여서 어디에서도 불러오지 않는다. `api/planner.js`는 `GroundView`가 `postSky`만 쓴다. 정리할 수 있다.
- 프론트 `vitest` 전체 실행의 기존 실패 6건(chatNavigation, naturalBodyModels, saturnPlane 2건, spacecraftModel, zoomScale)은 이번 작업과 무관하다.

## 선택하지 않은 심화

- F3020 이상 징후 진단, F3021 Planner/Worker 구조 전환, F3023 캘린더 연동 Tool
