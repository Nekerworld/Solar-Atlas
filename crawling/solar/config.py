import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV = ROOT / ".env"
ENDPOINT = "https://gms.ssafy.io/gmsapi/api.openai.com/v1/responses"
MODEL = "gpt-6-luna"
VERSION = "solar-v1"
CATALOG = json.loads((ROOT.parent / 'catalog' / 'solar_targets.json').read_text(encoding='utf-8'))['targets']
GROUPS = ('all', 'base', 'new', 'expansion', 'moons', 'dwarfs', 'comets', 'artifacts', 'regions')
TARGETS = [(t['id'], t['name_ko'], t['type'], t['parent_id']) for t in CATALOG]
COMMON = ["크기와 측정 기준", "질량", "밀도", "자전 주기와 태양일", "공전과 궤도", "구조와 조성", "관측과 탐사"]
FIELDS = {
    "star": ["항성 분류", "광도", "광구 온도", "핵융합", "내부 구조", "차등 자전", "흑점과 태양풍"],
    "planet": ["대기 조성과 기압", "온도와 측정 조건", "자전축 기울기", "자기장", "표면 또는 대기 현상", "고리", "위성계"],
    "dwarf_planet": ["분류 근거", "대기", "표면", "위성 관계", "궤도 특성"],
    "natural_satellite": ["모천체 관계", "삼축 크기", "조석 고정", "표면", "기원 가설", "궤도 변화"],
}
PROPERTIES = {"P2067":"mass", "P2120":"radius", "P2386":"diameter", "P2146":"orbital_period", "P2147":"rotation_period", "P2233":"semi_major_axis", "P2054":"density", "P7015":"surface_gravity", "P2213":"inclination", "P1096":"eccentricity", "P397":"parent_body", "P215":"spectral_class"}

FIELDS['dwarf_planet_candidate'] = FIELDS['dwarf_planet'] + ['왜소행성 후보 분류와 불확실성']
FIELDS['comet'] = ['혜성 분류와 주기', '근일점과 원일점', '핵의 크기와 조성', '코마와 꼬리', '발견과 관측', '탐사']
FIELDS['spacecraft'] = ['임무 목적', '운영 기관', '발사와 운용 상태', '궤도와 위치 및 기준 시점', '탑재 장비', '주요 성과']
FIELDS['region'] = ['정의와 범위', '구성 천체', '구조와 분포', '형성과 기원 가설', '관측 근거와 불확실성', '탐사']

FIELDS['asteroid'] = ['소행성 분류', '형상과 표면', '관측 방법과 불확실성', '위성 관계', '탐사']
FIELDS['centaur'] = ['켄타우로스 분류', '궤도와 불안정성', '표면과 활동성', '관측과 불확실성']
FIELDS['trans_neptunian_object'] = ['해왕성 바깥 천체 분류', '형상과 표면', '형성 가설', '관측과 탐사']

def checklist_for(kind):
    return ([] if kind in ('spacecraft', 'region') else COMMON) + FIELDS[kind]

def select_targets(group='all', only=None):
    if group not in GROUPS:
        raise ValueError('Unknown target group: ' + group)
    available = [t for t in CATALOG if group == 'all' or group in t['groups']]
    if only:
        selected = []
        for value in only:
            matches = [t for t in available if value in [t['id'], t['name_ko'], t['frontend_name'], *t['aliases']]]
            if len(matches) != 1 or matches[0] in selected:
                raise ValueError('Unknown or duplicate target: ' + value)
            selected.append(matches[0])
        available = selected
    return [(t['id'], t['name_ko'], t['type'], t['parent_id']) for t in available]
