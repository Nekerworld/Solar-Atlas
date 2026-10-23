import json
from pathlib import Path

GROUPS = ('all', 'base', 'new', 'expansion', 'moons', 'dwarfs', 'comets', 'artifacts', 'regions')
CATALOG = json.loads((Path(__file__).resolve().parents[2] / 'catalog' / 'solar_targets.json').read_text(encoding='utf-8'))['targets']

def target_ids(group):
    if group not in GROUPS:
        raise ValueError('Unknown target group: ' + group)
    return [t['id'] for t in CATALOG if group == 'all' or group in t['groups']]
