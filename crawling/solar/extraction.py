from .config import checklist_for


def batches(paragraphs, budget=14000):
    batch, size = [], 0
    for p in paragraphs:
        if batch and size + len(p['text']) > budget:
            yield batch
            batch, size = [], 0
        batch.append(p)
        size += len(p['text'])
    if batch:
        yield batch


def validate_facts(result, paragraphs, document_id, item_id):
    lookup = {p['id']:p['text'] for p in paragraphs}
    accepted, rejected = [], []
    if not isinstance(result.get('facts'), list):
        raise ValueError('Extraction must return facts array')
    for f in result['facts']:
        valid = (isinstance(f, dict) and isinstance(f.get('field'), str) and bool(f['field'].strip())
                 and f.get('status') in ('established', 'hypothesis')
                 and isinstance(f.get('value'), (str,int,float)) and not isinstance(f.get('value'), bool)
                 and isinstance(f.get('evidence'), list) and bool(f['evidence']))
        if valid:
            for e in f['evidence']:
                if not isinstance(e, dict):
                    valid = False
                    break
                quote = e.get('quote')
                if not isinstance(e.get('paragraph_id'), str) or not isinstance(quote, str) or not quote.strip() or quote not in lookup.get(e.get('paragraph_id'), ''):
                    valid = False
                    break
        if valid:
            accepted.append({**f, 'item_id':item_id, 'document_id':document_id,
                             'method':'llm', 'validation_status':'evidence_quote_verified'})
        else:
            rejected.append({'reason':'invalid_schema_or_unmatched_quote', 'candidate':f})
    return accepted, rejected


def extract(llm, item, document):
    facts, rejected = [], []
    for group in batches(document['paragraphs']):
        result = llm.json(
            'Extract only facts ABOUT the target body supported by these paragraphs. Return '
            '{"facts":[{"field":"Korean field name", "value":"supported explanation or number", '
            '"unit":null, "measurement_basis":null, "status":"established or hypothesis", '
            '"evidence":[{"paragraph_id":"p1", "quote":"exact nonempty substring"}]}]}. '
            'Missing facts must be omitted. Preserve uncertainty, measurement conditions and hypotheses.',
            {'item':item, 'checklist':checklist_for(item['type']), 'paragraphs':group})
        good, bad = validate_facts(result, group, document['document_id'], item['id'])
        facts.extend(good)
        rejected.extend(bad)
    return facts, rejected


def plan(llm, item, facts):
    result = llm.json(
        'Propose at most 4 related topic searches and 3 evaluation questions. These are research plans, not facts. '
        'Return {"topics":[{"topic":"...", "query":"Wikipedia search query in item.source_language", "reason":"...", "question":"..."}], '
        '"questions":[{"question":"...", "required_fields":["..."]}], '
        '"coverage":[{"field":"exact checklist field", "status":"found or needs_research", "fact_indices":[0]}]}. '
        'fact_indices index supplied facts. found requires supporting indices. Missing does not mean not applicable.',
        {'item':item, 'checklist':checklist_for(item['type']), 'facts':facts})
    topics, questions, coverage = (result.get(k) for k in ('topics','questions','coverage'))
    if not all(isinstance(x, list) for x in (topics, questions, coverage)):
        raise ValueError('Invalid research plan')
    topics = [t for t in topics if isinstance(t, dict) and all(isinstance(t.get(k), str) and t[k].strip() for k in ('topic','query','reason','question'))][:4]
    questions = [q for q in questions if isinstance(q, dict) and isinstance(q.get('question'), str) and isinstance(q.get('required_fields'), list)][:3]
    questions = [{**q, 'validation_status':'requires_review'} for q in questions]
    checked = []
    for field in checklist_for(item['type']):
        proposed = next((c for c in coverage if isinstance(c, dict) and c.get('field') == field), {})
        indices = proposed.get('fact_indices', [])
        indices = [i for i in indices if type(i) is int and 0 <= i < len(facts)] if isinstance(indices, list) else []
        checked.append({'field':field, 'status':'found' if proposed.get('status') == 'found' and indices else 'needs_research', 'fact_indices':indices})
    return {'topics':topics, 'questions':questions, 'coverage':checked}


def select(llm, item, topic, candidates):
    result = llm.json('Select up to 2 candidates useful for explaining this topic for the target body. Return '
                      '{"selected":[{"page_id":123, "role":"concept or observation or comparison", "reason":"..."}]}. '
                      'Use only supplied IDs. Prefer fewer relevant documents. Snippets are provisional.',
                      {'item':item, 'topic':topic, 'candidates':candidates})
    if not isinstance(result.get('selected'), list):
        raise ValueError('Invalid selection')
    ids, valid, seen = {c['page_id'] for c in candidates}, [], set()
    for s in result['selected']:
        if (isinstance(s, dict) and type(s.get('page_id')) is int and s['page_id'] in ids and s['page_id'] not in seen
            and s.get('role') in ('concept','observation','comparison') and isinstance(s.get('reason'), str) and s['reason'].strip()):
            valid.append(s)
            seen.add(s['page_id'])
    return valid[:2]


def verify_connection(llm, item, topic, document):
    evidence = []
    for group in batches(document['paragraphs']):
        result = llm.json('Find exact passages that help answer the topic question for the target. Return '
                          '{"evidence":[{"paragraph_id":"p1", "quote":"exact substring"}]}. '
                          'Return empty array if irrelevant. A generic concept can be useful without naming the body.',
                          {'item':item, 'topic':topic, 'paragraphs':group})
        if not isinstance(result.get('evidence'), list):
            raise ValueError('Invalid connection evidence')
        lookup = {p['id']:p['text'] for p in group}
        for e in result['evidence']:
            if isinstance(e, dict) and isinstance(e.get('paragraph_id'), str) and isinstance(e.get('quote'), str) and e['quote'].strip() and e['quote'] in lookup.get(e.get('paragraph_id'), ''):
                evidence.append(e)
    return evidence
