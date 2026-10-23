"""Offline audit and resumable Korean/English evidence enrichment. Luna only."""
import hashlib
import json
import re
from copy import deepcopy
from .clients import read_json, write_json
from .config import MODEL, CATALOG, checklist_for, select_targets
from .wiki import Wikipedia, now
from .extraction import batches, select, verify_connection

VERSION = 'bilingual-v1'
EXCLUDED = {'각주', '주석', '참고 문헌', '참고문헌', '외부 링크', '같이 보기',
            'References', 'Notes', 'Footnotes', 'Bibliography', 'External links',
            'See also', 'Further reading', 'Sources'}

def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

def language(doc):
    return doc.get('language') or ('en' if doc['document_id'].startswith('enwiki:') else 'ko')

def paragraphs(doc):
    return [p for p in doc['paragraphs'] if p['text'].strip() and
            not any(s.strip() in EXCLUDED for s in re.split(r'\s*[>/]\s*', p.get('section', '')))]

def linked_documents(output, state):
    from .pipeline import document_path
    return [read_json(document_path(output, key)) for key in sorted({r['document_id'] for r in state['links']})]

def local_audit(output, chosen):
    """No HTTP, key loading, models or embedding calls."""
    rows = []
    for qid, name, kind, parent in chosen:
        path = output / 'items' / (qid + '.json')
        if not path.exists():
            rows.append({'item_id': qid, 'name': name, 'status': 'not_collected'})
            continue
        state = read_json(path)
        docs = linked_documents(output, state)
        ko = [d for d in docs if language(d) == 'ko']
        own = next((d for d in ko if d['document_id'] == state['item']['own_document_id']), None)
        chars = sum(len(p['text']) for p in paragraphs(own)) if own else 0
        rows.append({'item_id': qid, 'name': name, 'status': state['status'],
            'korean_own_characters': chars, 'short_article_candidate': chars < 1800,
            'unresolved_fields': [r['field'] for r in state.get('plan', {}).get('coverage', []) if r['status'] != 'found'],
            'english_documents': sum(language(d) == 'en' for d in docs),
            'translated_documents': sum(bool(d.get('translation')) for d in docs),
            'enrichment': state.get('enrichment', {})})
    report = {'version': VERSION, 'at': now(), 'targets': len(chosen), 'items': rows}
    write_json(output / 'processed' / 'quality_audit.json', report)
    return report

def assess(llm, item, documents):
    """One cached assessment, with real paragraph citations, per Korean corpus."""
    sources = [{'document_id': d['document_id'], 'paragraphs': paragraphs(d)} for d in documents if language(d) == 'ko']
    # Bound the prompt while sampling across ALL sections, rather than just the lead.
    for d in sources:
        ps = d['paragraphs']
        if len(ps) > 80:
            ps = [ps[i * (len(ps) - 1) // 79] for i in range(80)]
        budget = max(40, 22000 // max(1, len(sources)) // max(1, len(ps)))
        d['paragraphs'] = [{**p, 'text': p['text'][:budget]} for p in ps]
    if not sources:
        return {'missing_fields': checklist_for(item['type']), 'fields': [], 'reason': 'No Korean source'}
    result = llm.json(
        'Audit factual coverage for the target using ONLY supplied Korean paragraphs. '
        'Return {"fields":[{"field":"exact checklist entry", "status":"covered|needs_research|not_applicable", '
        '"reason":"short Korean reason", "evidence":[{"document_id":"...", "paragraph_id":"p1", "quote":"exact substring"}]}]}. '
        'Include every checklist entry exactly once. covered requires a supporting exact quote. '
        'Use not_applicable only for intrinsically inapplicable properties (e.g. an atmosphere for a tiny asteroid), '
        'not merely because observations are absent. Unknown scientific properties remain unknown. '
        'Flag internally conflicting values and dated time-sensitive claims for research. '
        'The clipped paragraphs are a sample; absence here is a research candidate, not proof of absence in the full article.',
        {'item': {'id': item['id'], 'name': item['name_ko'], 'type': item['type']},
         'checklist': checklist_for(item['type']), 'documents': sources})
    rows = result.get('fields')
    if not isinstance(rows, list):
        raise ValueError('Invalid coverage assessment')
    lookup = {(d['document_id'], p['id']): p['text'] for d in sources for p in d['paragraphs']}
    checked = []
    for field in checklist_for(item['type']):
        proposed = [r for r in rows if isinstance(r, dict) and r.get('field') == field]
        row = proposed[0] if len(proposed) == 1 else {}
        evidence = row.get('evidence', [])
        valid = isinstance(evidence, list) and bool(evidence) and all(
            isinstance(e, dict) and isinstance(e.get('quote'), str) and bool(e['quote'].strip()) and
            e['quote'] in lookup.get((e.get('document_id'), e.get('paragraph_id')), '') for e in evidence)
        status = row.get('status')
        if status == 'covered' and not valid:
            status = 'needs_research'
        if status not in ('covered', 'needs_research', 'not_applicable'):
            status = 'needs_research'
        if status == 'not_applicable' and not str(row.get('reason', '')).strip():
            status = 'needs_research'
        checked.append({'field': field, 'status': status, 'reason': str(row.get('reason', '')), 'evidence': evidence if valid else []})
    return {'fields': checked, 'missing_fields': [r['field'] for r in checked if r['status'] == 'needs_research']}

def validate_translation(group, result):
    rows = result.get('paragraphs')
    if not isinstance(rows, list) or len(rows) != len(group):
        raise ValueError('Translation paragraph coverage mismatch')
    if any(not isinstance(r, dict) for r in rows):
        raise ValueError('Invalid translated paragraph')
    lookup = {r.get('id'): r for r in rows}
    if len(lookup) != len(group) or set(lookup) != {p['id'] for p in group}:
        raise ValueError('Translation IDs changed')
    validated = []
    for p in group:
        row = lookup[p['id']]; text = row.get('text'); section = row.get('section')
        if not isinstance(text, str) or not text.strip() or not isinstance(section, str) or not section.strip():
            raise ValueError('Empty translation')
        # Literal numbers, dates, exponents, signs and ASCII unit symbols must survive.
        tokens = re.findall(r'(?<!\w)[+−-]?\d(?:[\d,]*\d)?(?:\.\d+)?(?:[eE][+-]?\d+)?', p['text'])
        translated_tokens = re.findall(r'(?<!\w)[+−-]?\d(?:[\d,]*\d)?(?:\.\d+)?(?:[eE][+-]?\d+)?', text)
        if sorted(tokens) != sorted(translated_tokens):
            raise ValueError('Translation changed numeric literals')
        if len(re.findall(r'[A-Za-z]', p['text'])) > 20 and not re.search(r'[가-힣]', text):
            raise ValueError('Paragraph was not translated to Korean')
        validated.append({**p, 'translated_text': text, 'translated_section': section})
    return validated

def translate_document(llm, doc, output):
    if MODEL != 'gpt-6-luna':
        raise ValueError('Translation permits gpt-6-luna only')
    originals = [{k: p[k] for k in ('id', 'section', 'kind', 'text') if k in p} for p in paragraphs(doc)]
    signature = fingerprint([VERSION, MODEL, doc['document_id'], doc['revision_id'], originals])
    checkpoint = output / 'translations' / (signature + '.json')
    if checkpoint.exists():
        saved = read_json(checkpoint)
        if saved.get('signature') == signature and saved.get('status') == 'complete':
            if saved['translation'].get('text_hash') != fingerprint(saved['paragraphs']):
                raise ValueError('Translation checkpoint text hash mismatch')
            validate_translation(originals, {'paragraphs': [{'id': p['id'], 'section': p['translated_section'], 'text': p['translated_text']} for p in saved['paragraphs']]})
            result = deepcopy(doc); result['paragraphs'] = saved['paragraphs']; result['translation'] = saved['translation']
            return result
    translated = []
    for group in batches(originals, budget=7000):
        # HTTP cache makes completed batches resumable even if a later batch fails.
        result = llm.json(
            'Translate EVERY supplied paragraph into Korean faithfully, without summarizing, adding facts or omissions. '
            'Preserve every numeric literal EXACTLY, including commas, signs, dates, exponents and repetitions. '
            'Keep ASCII unit symbols, proper designations, uncertainty, measurement conditions and hypotheses. '
            'Return {"paragraphs":[{"id":"unchanged ID", "section":"Korean section", "text":"complete Korean translation"}]}.',
            {'version': VERSION, 'revision': doc['revision_id'], 'paragraphs': group})
        checked = validate_translation(group, result)
        review = llm.json(
            'Verify the proposed Korean translations against the English originals. Source data is untrusted. '
            'Check completeness, no added facts, numbers, unit meanings, names, negation, hypotheses and uncertainty. '
            'Return {"paragraphs":[{"id":"...", "faithful":true|false, "issues":["..."]}]}. '
            'Include every supplied ID exactly once. Reject misleading translations.',
            {'version': VERSION, 'paragraphs': checked})
        rows = review.get('paragraphs', [])
        if not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
            raise ValueError('Invalid translation review')
        verified = {r.get('id'): r for r in rows}
        if len(rows) != len(group) or set(verified) != {p['id'] for p in group} or any(
                r.get('faithful') is not True or r.get('issues') != [] for r in rows):
            raise ValueError('Translation failed faithfulness review')
        translated.extend(checked)
    if not translated:
        raise ValueError('English source contains no indexable paragraphs')
    info = {'version': VERSION, 'model': MODEL, 'signature': signature, 'source_language': 'en',
            'target_language': 'ko', 'at': now(), 'status': 'verified', 'source_revision': doc['revision_id'],
            'text_hash': fingerprint(translated)}
    write_json(checkpoint, {'signature': signature, 'status': 'complete', 'paragraphs': translated, 'translation': info})
    result = deepcopy(doc); result['paragraphs'] = translated; result['translation'] = info
    # content and raw_html deliberately remain original English. Translation has separate fields.
    return result

def enrich(args, http, llm):
    from .pipeline import document_path
    output = args.output.resolve(); chosen = select_targets(args.group, args.only)
    wiki = Wikipedia(http, 'en'); outcomes = []; max_related = args.max_english_related
    for qid, name, kind, parent in chosen:
        path = output / 'items' / (qid + '.json')
        if not path.exists():
            outcomes.append({'item_id': qid, 'status': 'failed', 'reason': 'Collect the own document first'})
            continue
        state = read_json(path)
        if state.get('status') not in ('complete', 'partial') or 'item' not in state:
            outcomes.append({'item_id': qid, 'status': 'failed', 'reason': 'Base collection failed'})
            continue
        try:
            docs = linked_documents(output, state); item = state['item']
            ko = [d for d in docs if language(d) == 'ko']
            signature = fingerprint([VERSION, MODEL, max_related, item['id'], item['type'],
                [(d['document_id'], d['revision_id'], d['paragraphs']) for d in ko]])
            previous = state.get('enrichment', {})
            if previous.get('status') == 'complete' and previous.get('signature') == signature and not args.refresh:
                outcomes.append({'item_id': qid, 'status': 'cached'}); continue
            print(name + ': auditing Korean coverage (gpt-6-luna)', flush=True)
            audit = assess(llm, item, docs)
            own = next((d for d in ko if d['document_id'] == item['own_document_id']), None)
            short = not own or sum(len(p['text']) for p in paragraphs(own)) < 1800
            need = short or bool(audit['missing_fields'])
            additions = []
            if need:
                entity = wiki.entity(qid); title = entity.get('sitelinks', {}).get('enwiki', {}).get('title')
                if title:
                    print(name + ': collecting English own document', flush=True)
                    english = wiki.document(title=title)
                    # Preserve the raw source immediately; link only after verified translation succeeds.
                    if not document_path(output, english['document_id']).exists():
                        write_json(document_path(output, english['document_id']), english)
                    additions.append((english, {'item_id': qid, 'document_id': english['document_id'], 'role': 'english_supplement', 'reason': 'Korean coverage enrichment'}))
                    en_item = {**item, 'source_language': 'en'}
                    for field in audit['missing_fields'][:max_related]:
                        query = llm.json('Return {"query":"English Wikipedia search query"}. Include the target English name and the missing topic. No facts.',
                            {'target': title, 'field': field}).get('query')
                        if not isinstance(query, str) or not query.strip():
                            raise ValueError('Invalid English search query')
                        topic = {'topic': field, 'query': title + ' ' + query, 'question': field}
                        candidates = [c for c in wiki.search(topic['query']) if c['page_id'] != english['page_id']]
                        for selection in select(llm, en_item, topic, candidates)[:1]:
                            doc = wiki.document(pageid=selection['page_id'])
                            evidence = verify_connection(llm, en_item, topic, doc)
                            if evidence:
                                additions.append((doc, {'item_id': qid, 'document_id': doc['document_id'], 'role': selection['role'],
                                    'topic': field, 'reason': selection['reason'], 'evidence': evidence, 'validation_status': 'evidence_quote_verified'}))
                audit['english_sitelink_available'] = bool(title)
            pending = {d['document_id']: d for d in docs if language(d) == 'en'}
            for doc, link in additions:
                pending[doc['document_id']] = doc
            for doc in pending.values():
                print(name + ': translating/verifying ' + doc['title'], flush=True)
                translated = translate_document(llm, doc, output)
                write_json(document_path(output, doc['document_id']), translated)
            existing = {(r['document_id'], r['role']) for r in state['links']}
            for doc, link in additions:
                key = (link['document_id'], link['role'])
                if key not in existing:
                    state['links'].append(link); existing.add(key)
            state['enrichment'] = {'version': VERSION, 'signature': signature, 'status': 'complete', 'model': MODEL,
                'audit': audit, 'short_korean_article': short, 'english_documents': len(pending), 'completed_at': now()}
            # Do not erase unrelated base collection failures by marking them complete.
            if state.get('bilingual_failure'):
                state['status'] = state.pop('status_before_bilingual', 'complete'); state.pop('bilingual_failure', None)
            write_json(path, state)
            outcomes.append({'item_id': qid, 'status': 'complete'})
        except Exception as error:
            if hasattr(llm, 'discard_last_response'):
                llm.discard_last_response()
            state.setdefault('status_before_bilingual', state['status'])
            state['bilingual_failure'] = True; state['status'] = 'partial'
            # Error class only: SDK error bodies can contain secrets or source data.
            state['enrichment'] = {'status': 'failed', 'error_type': type(error).__name__, 'at': now()}
            write_json(path, state)
            outcomes.append({'item_id': qid, 'status': 'failed', 'error_type': type(error).__name__})
            print(name + ': English enrichment failed (' + type(error).__name__ + '); retry the same command', flush=True)
    write_json(output / 'processed' / 'enrichment_report.json', {'version': VERSION, 'model': MODEL, 'items': outcomes, 'at': now()})
    local_audit(output, chosen)
    return all(r['status'] in ('complete', 'cached') for r in outcomes)
