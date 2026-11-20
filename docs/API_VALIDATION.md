# 외부 API 검증

검증 시각: 2026-11-20. 스크립트: `planner_backend/scripts/verify_external_apis.py`. Mock 성공은 통과로 치지 않았다. 키 값은 출력하지 않았다.

## 실호출 결과

| API | 결과 | 내용 |
| --- | --- | --- |
| Google Places Text Search | 성공 | 서울, “천문대” 검색. 후보 3개, `place_id` 포함. |
| Google Place Details | 성공 | 위 검색의 `place_id`로 호출. 이름 “시립서울천문대”, 좌표 37.5461529, 127.1062622, 지도 링크 포함. |
| JPL Horizons | 성공 | 서울 37.5665, 126.9780, 다음 날 20:00부터 3시간, 목성. 샘플 7개. 첫 고도 -34.33°, 태양 고도 -31.95°. 키 없음. |
| Open-Meteo | 성공 | 같은 서울 좌표·구간. 시간 4개. 첫 구름량 0%. 키 없음. |
| Open-Meteo 예보 구간 밖 | 성공(실패 코드 확인) | +40일 구간은 `FORECAST_UNAVAILABLE`, 메시지 “요청한 기간의 날씨 예보가 없습니다.” 값을 만들지 않았다. |
| Google Routes | 제외 | 같은 키로 인증은 통과했으나 DRIVE와 WALK 모두 HTTP 200에 빈 객체 `{}`가 돌아왔다. 콘솔 사용량에는 요청이 집계되고 오류는 0건이다. 원인을 특정하지 못해 `PLANNER_ROUTES_ENABLED=false`로 끄고 Tool 목록에서 뺐다. 직선거리로 대체하지 않았다. |
| SSAFY GMS | 부분 검증 | LLM(`claude-haiku-5-5`, OpenAI 호환 `POST https://gms.ssafy.io/gmsapi/api.anthropic.com/v1/chat/completions`, `Authorization`과 `x-api-key`)은 OpenAI 경로 429로 Gemini에서 교체한 뒤 2026-11-20에 실호출로 확인했다. 의도 분석, 작업 계획, 2차 답변 생성이 정상 응답을 받았다. 이전 Gemini 검증(6문장, 시나리오 6건)은 모델이 바뀌어 재실행 전까지 참고용이다. OpenAI 경로의 임베딩은 같은 날 HTTP 429(조직 지출 한도 초과)여서 GMS Gemini 경로(`POST https://gms.ssafy.io/gmsapi/generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents`, 헤더 `x-goog-api-key`)로 바꾸고 3072차원 벡터를 받는 것을 확인했다. 새로 색인하기 전까지 지식 검색은 미검증이다. |

명세 2.1의 외부 API 3종은 Google Places, JPL Horizons, Open-Meteo이며 세 가지 모두 실응답으로 확인했다. 제공하는 정보가 서로 다르다(장소, 천체 위치, 날씨). GMS는 LLM이므로 3종에 세지 않는다. Horizons와 Open-Meteo는 키가 없는 공개 API이고, 이 점은 강사 확인이 필요한 사항으로 남긴다.

영화 도메인 팩으로는 전환하지 않았다.

## 추가로 호출해 본 Google API

같은 키로 Geocoding, Geolocation, Maps Static, Street View Static을 한 번씩 호출해 모두 HTTP 200을 확인했다. 플래너는 이 API들을 사용하지 않는다. Geolocation은 호출한 PC의 IP로 추정한 위치(정확도 약 2.4km)를 돌려주므로 사용자 위치로 쓰지 않는다.

## 명세서 2.1

- Places (New)는 장소 이름과 `place_id`를 준다. 상세는 그 식별자로 주소, 지도 링크, 좌표를 준다. 키는 서버 환경변수만 사용한다. 호출은 Google Maps Platform 약관과 과금 정책을 따른다.
- Horizons는 관측자 좌표의 방위각·고도를 준다. 키는 없다. 공개 API이며 과도한 호출은 피하기 위해 후보를 3곳, 샘플 간격을 30분으로 제한한다.
- Open-Meteo는 구름량, 강수확률, 강수량을 준다. 키는 없다. 예보 구간 밖은 값을 만들지 않고 `FORECAST_UNAVAILABLE`로 둔다. +40일 요청은 그 코드와 안내 문구로 돌아왔다.
- 저장 결과물은 관측 계획이다. 천체, 장소, 시작 시각, 종료 시각, 생성 시각을 저장한다. 건강·금융 자문이 아니므로 전문가 면책 문구는 넣지 않는다.

## 명세서 2.7

영화 예제 팩으로는 전환하지 않았다. 수업용 Movie Planner 스켈레톤은 제출물에서 제거했다.

## Tool 없이 LLM만 답하면 틀리는 점

- “이번 토요일 20시에 서울숲에서 목성을 1시간 보고 싶어.” 서울숲 좌표와 그 시각의 목성 고도·태양 고도는 외부 조회 없이 확정할 수 없다.
- “오늘 21시에 남산에서 목성을 1시간 봐 줘.” 그 시각이 부적합한지, 같은 날 다른 시각이 적합한지는 천문력 계산 없이 알 수 없다.
- “오늘 밤 집 앞에서 목성을 보고 싶어. 고도 80도 이상, 구름 0%, 이동 10분 이내.” 세 제약이 동시에 맞는지, 재계획이 3회에서 멈춰야 하는지는 측정값 없이 말할 수 없다.
- “이번 토요일 서울숲에서 목성 관측 계획 짜 줘.” 천문력이 실패하면 고도를 숫자로 채우면 안 된다. 그 후보는 `UNVERIFIED`다.
- “이 플래너 어떻게 써?” 사용법 안내에는 Tool이 필요 없다. 장소나 고도를 만들어 답하면 틀리다.

후보를 보충하는 별도 API는 두지 않는다. 선택한 천체는 이미 정해져 있고, 후보 항목은 장소다. 검색 결과가 없으면 `NO_RESULT`이며 Horizons 천체 목록으로 장소를 만들지 않는다.

## 구현 전 설계 시험

한 요청의 Tool 사슬은 `search_places` → `get_place_details` → `get_ephemeris`, `get_weather`, 이동 제한이 있을 때만 `get_route`다. 검색이 준 `place_id`만 상세 조회로 넘긴다. 좌표가 없으면 그 후보는 판정하지 않는다.

재계획은 충족 후보가 하나도 없을 때만 한다. 순서는 같은 날·같은 장소의 다른 시간, 같은 날 다른 장소, 사용자가 허용한 날짜, 사용자가 허용한 다른 천체다. 상한은 3회다. 키 없음, 인증 실패, 호출 한도, 예보 범위 밖처럼 다시 불러도 결과가 같은 오류는 재계획하지 않고 바로 안내한다(`replan_skipped` 이벤트, 시나리오 S4·S7). 천문력 일시 실패처럼 후보가 모두 `UNVERIFIED`인 경우도 기준을 바꿔도 같은 Tool이 다시 실패할 수 있어 재계획하지 않는다. 이미 성공한 같은 입력은 캐시 키 `(provider, tool, normalized_args)`로 다시 호출하지 않는다. 이 동작은 Mock 테스트로 확인했고, 실 API 성공 여부와 분리한다.

## 천구와 Horizons

같은 지점, 2026-11-19 11:00 UTC, 목성. 화면의 astronomy-engine(굴절 normal)은 방위각 26.173°, 고도 -34.556°, 태양 고도 -31.374°다. Horizons와의 차이는 방위각 0.002°, 목성 고도 0.400°, 태양 고도 0.422°다. 화면 표시 허용 오차는 1°로 둔다. 계획의 적합 여부는 이 화면 값이 아니라 Horizons 결과로 판정한다.

## 라이브러리

LangGraph는 저장소의 1.2.12를 유지한다. 명세서 예시 1.2.10으로 내리지 않았다. Places와 Routes는 REST로 호출한다. `google-api-python-client`는 쓰지 않는다. 이 차이는 F3001~F3019 기능 누락이 아니다.
