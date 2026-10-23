# 한국어·영어 보완 수집 및 번역 색인

프로젝트 루트에서 가상환경 활성화 후 실행합니다. 이 문서는 실행 안내이며, 코드 수정 중 실제 수집이나 색인은 수행하지 않았습니다.

## 모델 제한

- 수집 중 근거 추출·품질 진단·검색어 생성·영어 번역·번역 검증: `gpt-6-luna`만 사용합니다. 기존 고정 GMS Responses 클라이언트를 사용하며 다른 모델로 승격하지 않습니다.
- 벡터 임베딩: `text-embedding-3-large`, 기본 3072차원. 다른 임베딩 모델 설정은 거부합니다.
- 채팅 요청은 이 작업에 필요하지 않습니다. 채팅의 기존 모델 승격 설정과 별개인 수집 경로입니다.

## 실행 순서

```bash
python crawling/collect.py --audit-only
python crawling/collect.py --group all
python backend/manage.py index_solar --group all --dry-run
python backend/manage.py index_solar --group all
```

`--group all`은 100종 전체를 처리합니다. 한국어 수집이 완료된 기존 70종은 기존 체크포인트와 HTTP 캐시를 재사용한 후 영어 보완을 수행합니다. `--group expansion`은 최근 추가한 30종만, `--group new`는 기존 확장 57종과 최근 추가 30종을 포함합니다. 한국어 원문을 새로 수집해야 하는 경우에만 `--refresh`를 사용하세요. 이 옵션은 HTTP/LLM 캐시도 무시하므로 일반 재개에는 필요 없습니다.

중단되거나 번역 검증에 실패하면 동일 명령을 재실행합니다. 원래 수집을 건너뛰고 보완만 재개하려면:

```bash
python crawling/collect.py --group all --enrich-only
```

천체별 영문 자체 문서 외 관련 주제 검색은 기본 최대 2개이며 `--max-english-related 0`으로 관련 문서 확장을 끌 수 있습니다. 이 경우에도 부족한 천체의 영문 자체 문서와 이미 수집된 영어 문서는 번역합니다.

## 정보 부족 판정

한국어 자체 문서가 없거나 정제 본문 1800자 미만인 경우 보완 후보입니다. 본문이 길어도 천체 유형별 체크리스트에 대해 Luna가 근거 인용으로 확인하지 못한 주제, 수치 충돌, 시점 의존 정보는 보완 후보가 됩니다. 원천적으로 해당하지 않는 항목은 별도로 분류합니다. 진단은 제한된 원문 표본으로 수행하므로 후보 지정이 정확한 결손의 증명은 아닙니다.

Wikidata의 동일 QID 영어 sitelink로 자체 문서의 정체성을 고정합니다. 관련 영문 문서는 검색 결과 ID 검증 및 실제 문단 인용 검증 후 연결합니다. 영문 보완을 마쳤다는 것은 모든 과학적 미지수가 해소되었다는 뜻이 아닙니다. 측정 자료가 없는 정보는 계속 미확인 상태로 답해야 합니다.

## 보관과 인용

- `documents/*.json`: 영어 `raw_html`, `content`, 문단의 `text`는 원문 그대로 유지합니다. 같은 문단에 `translated_text`, `translated_section`을 별도로 저장합니다.
- `translations/*.json`: 원문 문서 ID·리비전·본문 해시·모델·번역 버전으로 구분한 검증 완료 번역 체크포인트입니다.
- 영어 각주/참고문헌/외부 링크 등은 번역·색인 대상에서 제외합니다.
- 숫자 문자열·문단 ID·누락 여부를 검사하고, 별도 Luna 호출로 의미·단위·부정·불확실성·가설을 검증합니다. 검증 실패 시 해당 천체는 partial로 표시하여 전체 색인을 차단합니다. 잘못된 모델 응답 캐시만 제거하므로 정상 배치는 재사용합니다.
- Chroma에는 영어 원문 대신 검증된 한국어 번역문을 임베딩합니다. 메타데이터에는 대응 원문 문단, 원문 제목·URL·리비전·라이선스, 번역 모델과 해시를 보존합니다.
- 채팅 출처에는 한국어 기계 번역임을 표시하고 대응 영어 원문 문단을 펼칠 수 있습니다. 영어 원문 문단 전체는 정확한 선택 인용 구절과 별도로 표시합니다.
- Wikipedia 원문 라이선스 URL과 원 리비전을 보존하고 번역·변경임을 표시합니다. 모델의 충실성 검증은 사람의 전문 번역 감수를 대체하지 않습니다.

## 결과 확인

`crawling/data/solar_v1/processed/quality_audit.json`, `enrichment_report.json`, `collection_report.json`에서 천체별 상태, 미확인 항목과 번역 현황을 확인합니다. `index_solar --group all --dry-run`은 100종 중 미수집·partial 또는 검증되지 않은 영어 문서가 있으면 실패합니다. 이를 해결한 후 실제 색인을 수행합니다. 기존 벡터는 동일 내용이면 재사용하며, 천체의 두 컬렉션 저장이 성공한 뒤에만 그 천체의 오래된 청크를 정리합니다.

## 오프라인 회귀 테스트 (사용자 실행)

```bash
cd crawling
python -m unittest discover -s tests -v
cd ../backend
python manage.py test api.test_indexing api.test_bilingual_indexing -v 2
```

테스트는 가짜 모델·벡터와 로컬 fixture를 사용합니다. 실제 Luna/임베딩 품질과 크롤링 사이트 연결은 실제 실행 로그로 확인해야 합니다.
