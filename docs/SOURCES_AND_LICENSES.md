# 출처와 이용 조건

NF3007 기록이다. 호출 한도와 약관은 2026-11-20에 확인한 공개 안내 기준이며, 수치가 바뀔 수 있다. Google Places의 무료 사용량·단가는 가격 안내 페이지에 있고, Horizons는 숫자 상한 대신 공정 이용 조건을 공개한다.

## 외부 API

| 출처 | 쓰는 곳 | 키 | 호출 한도와 과금 | 약관과 표시 의무 | 이 프로젝트의 대응 |
| --- | --- | --- | --- | --- | --- |
| Google Places API (New) | `search_places`, `get_place_details` | `GOOGLE_MAPS_API_KEY` | 요청 종류(SKU)별 무료 사용량과 단가는 [Google Maps Platform 가격 안내](https://developers.google.com/maps/billing-and-pricing/pricing?hl=ko)에 있다. 결제 계정 연결이 필요하다. | Google Maps Platform 이용약관. 지도 없이 장소 정보를 보일 때 Google 출처를 표시해야 한다. 장소 내용을 장기 저장하지 않는다. | 서버에서만 호출. 후보 수 제한(`PLANNER_PLACE_LIMIT`, 기본 5). 장소 내용은 요청 안의 메모리 캐시에만 둔다. 플래너 화면 하단에 출처를 표시한다. |
| Google Routes API | `get_route` | 같은 키 | 요청당 과금. | Google Maps Platform 이용약관. | **제외.** 200 응답이 비어 있어(`{}`) 쓰지 않는다. `PLANNER_ROUTES_ENABLED=false`가 기본이다. |
| NASA JPL Horizons | `get_ephemeris`, 천구 소천체 위치·궤도 | 없음 | 숫자로 적힌 호출 상한은 없다. [SSD API 공정 이용](https://ssd-api.jpl.nasa.gov/doc/)은 필요한 요청만, 한 번에 하나씩, 같은 결과는 캐시하라고 정한다. 부하가 크면 JPL이 속도를 제한하거나 막을 수 있다. 2026-03-25 안내도 API 경로의 연결·속도 제한이 명령줄보다 낮다고만 하고 횟수는 밝히지 않는다. | JPL 공개 API. 천문력 결과의 출처를 밝힌다. 브라우저에서 이 API를 직접 부르지 않는다(NASA CORS 정책). | 서버에서만 호출한다. 후보 수와 30분 샘플 간격으로 호출을 제한하고, 같은 입력은 캐시한다. 화면 하단에 출처를 표시한다. |
| Open-Meteo | `get_weather` | 없음 | 무료 API는 분당 600회, 시간당 5,000회, 하루 10,000회까지다. 비상업 이용이 조건이다. | CC BY 4.0. 출처 표기가 필요하다. | 같은 입력은 캐시한다. 예보 구간 밖은 `FORECAST_UNAVAILABLE`로 돌려주고 값을 대체하지 않는다. 화면 하단에 `Open-Meteo.com (CC BY 4.0)`을 표시한다. |
| SSAFY GMS `claude-haiku-5-5`(LLM, 크롤링 번역), `gemini-embedding-2`(색인·질문 임베딩, 3072차원) | 의도 분석, 작업 계획, 챗봇 답변 생성, 지식 검색의 질문 임베딩 | `GMS_KEY` | 조직 단위 지출 한도가 있다. 2026-11-20 OpenAI 경로는 한도 초과(HTTP 429)였고, LLM(Claude)과 임베딩(Gemini) 경로는 같은 날 정상 응답을 받았다. | SSAFY 교육 과정 내 사용. | 키는 서버 환경변수로만 읽는다. 실패하면 일반 안내 문장만 보인다. 임베딩 모델을 바꿨으므로 기존 색인은 새로 만들어야 검색에 쓸 수 있다. |

## 로컬 자료

| 출처 | 쓰는 곳 | 조건 |
| --- | --- | --- |
| 2차 프로젝트 Chroma 색인 (`backend/chroma_db`, Wikipedia·Wikidata 등에서 모은 문서) | `search_knowledge` | 본문은 원문 라이선스를 따른다(Wikipedia는 CC BY-SA). 응답은 문서 제목, 출처 URL, 본문 일부(최대 600자)만 돌려준다. 색인이 없으면 `NO_INDEX`다. |
| astronomy-engine, Three.js | 지상 천구의 화면 계산 | 각 패키지 라이선스. 최종 적합 판정은 Horizons다. |
| 밝은 별 좌표 | 화면에 그리는 별과 별자리 선 | 공개 카탈로그의 J2000 적경·적위. 좌표를 만들지 않는다. |

## 키와 캐시

- API 키는 저장소 루트 `.env`(Git에서 제외)와 `planner_backend/.env`에서만 읽는다. 소스, 로그, 응답, 문서에 값을 쓰지 않는다. 점검 방법과 결과는 `docs/TEST_REPORT.md`의 비기능 점검 절에 있다.
- 캐시는 프로세스 메모리의 Tool 결과만 잠시 보관한다. 외부 응답 원문은 대화 메모리와 로그 이벤트에 넣지 않는다.
