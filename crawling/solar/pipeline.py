import hashlib
import json
from decimal import Decimal, InvalidOperation
from .clients import HTTP, LLM, read_json, write_json
from .config import TARGETS, PROPERTIES, MODEL, VERSION, CATALOG, select_targets
from .wiki import Wikipedia, now
from .extraction import extract, plan, select, verify_connection

# Only explicit, known units are normalized. Qualifiers are never discarded.
UNITS = {'Q11573':('m','m',1), 'Q828224':('km','m',1000),
         'Q11570':('kg','kg',1), 'Q11574':('s','s',1),
         'Q7727':('min','s',60), 'Q25235':('h','s',3600), 'Q573':('day','s',86400)}


def wikidata_facts(entity):
    records = []
    for prop, field in PROPERTIES.items():
        for claim in entity.get('claims', {}).get(prop, []):
            if claim.get('rank') == 'deprecated':
                continue
            snak = claim['mainsnak']
            value = snak.get('datavalue', {}).get('value')
            record = {'field':field, 'property_id':prop, 'claim_id':claim.get('id'),
                      'value_state':snak['snaktype'], 'value':value, 'rank':claim.get('rank'),
                      'qualifiers':claim.get('qualifiers', {}), 'references':claim.get('references', []),
                      'source_url':f"https://www.wikidata.org/wiki/{entity['id']}",
                      'source_revision':entity.get('lastrevid'), 'method':'wikidata'}
            if isinstance(value, dict) and 'amount' in value:
                unit_id = value.get('unit', '').rsplit('/',1)[-1]
                record['unit_id'] = unit_id
                if unit_id in UNITS:
                    label, canonical, factor = UNITS[unit_id]
                    try:
                        record['normalized'] = {'value':str(Decimal(value['amount']) * factor), 'unit':canonical, 'original_unit':label}
                    except InvalidOperation:
                        record['normalization_status'] = 'invalid_amount'
                else:
                    record['normalization_status'] = 'unit_requires_resolution'
            records.append(record)
    return records


def document_path(output, document_id):
    namespace, page_id = document_id.split(':')
    if namespace not in ('kowiki', 'enwiki') or not page_id.isdigit():
        raise ValueError('Invalid source document ID')
    filename = page_id if namespace == 'kowiki' else namespace + '_' + page_id
    return output / 'documents' / (filename + '.json')


def run(args):
    chosen = select_targets(getattr(args, 'group', 'all'), args.only)
    output = args.output.resolve()
    # Separate this implementation's outputs from any previous collector data.
    output.mkdir(parents=True, exist_ok=True)
    http = HTTP(output / 'cache', args.interval, args.refresh)
    llm = LLM(http, args.env_file)
    wiki = Wikipedia(http)
    signature = hashlib.sha256(json.dumps([VERSION, MODEL, args.max_related], sort_keys=True).encode()).hexdigest()
    def safe_error(error):
        message = str(error)
        key = getattr(llm, 'key', None)
        return message.replace(key, '[REDACTED]')[:400] if key else message[:400]
    report = {'started_at':now(), 'pipeline_version':VERSION, 'model':MODEL, 'targets':[t[0] for t in chosen], 'items':[]}
    for qid, name, kind, parent in chosen:
        checkpoint = output / 'items' / (qid + '.json')
        previous = read_json(checkpoint) if checkpoint.exists() else None
        if previous and previous.get('status') == 'complete' and previous.get('signature') == signature and not args.refresh:
            report['items'].append({'item_id':qid, 'status':'cached'})
            print(f'{name}: cached', flush=True)
            continue
        state = {'item_id':qid, 'signature':signature, 'status':'running', 'history':[], 'links':[], 'facts':[], 'rejected_facts':[]}
        stage = 'own_document'
        try:
            print(f'{name}: collecting own document', flush=True)
            entity = wiki.entity(qid)
            title = entity.get('sitelinks', {}).get('kowiki', {}).get('title')
            language = 'ko' if title else 'en'
            title = title or entity.get('sitelinks', {}).get('enwiki', {}).get('title')
            if not title:
                raise ValueError('No Korean or English Wikipedia sitelink')
            source_wiki = wiki if language == 'ko' else Wikipedia(http, language='en')
            own = source_wiki.document(title=title)
            write_json(output / 'raw' / (qid + '.wikidata.json'), entity)
            write_json(document_path(output, own['document_id']), own)
            item = {'id':qid, 'name_ko':entity.get('labels',{}).get('ko',{}).get('value',name),
                    'name_en':entity.get('labels',{}).get('en',{}).get('value'),
                    'aliases':{lang:[a['value'] for a in aliases] for lang,aliases in entity.get('aliases',{}).items()},
                    'source_language':language, 'type':kind, 'type_source':'curated_prototype_seed', 'parent_id':parent,
                    'parent_source':'curated_prototype_seed', 'description':entity.get('descriptions',{}).get('ko',{}).get('value'),
                    'own_document_id':own['document_id'], 'wikidata_url':f'https://www.wikidata.org/wiki/{qid}',
                    'wikipedia_url':own['source_url'], 'collected_at':now(), 'properties':wikidata_facts(entity)}
            seed = next(t for t in CATALOG if t['id'] == qid)
            item['aliases']['ko'] = list(dict.fromkeys([*item['aliases'].get('ko', []), name, *seed['aliases']]))
            state['item'] = item
            state['links'].append({'item_id':qid, 'document_id':own['document_id'], 'role':'own', 'reason':f'Wikidata {language} sitelink'})
            write_json(checkpoint,state)
            stage = 'extract'
            print(f'{name}: extracting evidence from {len(own["paragraphs"])} paragraphs', flush=True)
            state['facts'], state['rejected_facts'] = extract(llm,item,own)
            # A searchable grounded profile; the full source remains in the document collection.
            item['search_text'] = '\n'.join([item['name_ko'], item.get('name_en') or '', item.get('description') or ''] + [f"{f['field']}: {f['value']}" for f in state['facts']])
            write_json(checkpoint,state)
            stage = 'plan'
            print(f'{name}: planning related searches', flush=True)
            state['plan'] = plan(llm,item,state['facts'])
            write_json(checkpoint,state)
            stage = 'related_documents'
            related_ids = set()
            for topic in state['plan']['topics']:
                if len(related_ids) >= args.max_related:
                    break
                candidates = source_wiki.search(topic['query'])
                print(f'{name}: researching {topic["query"]}', flush=True)
                candidates = [c for c in candidates if c['page_id'] != own['page_id']]
                selected = select(llm,item,topic,candidates) if candidates else []
                audit = {'query':topic['query'], 'topic':topic, 'candidates':candidates, 'selected':selected, 'results':[], 'at':now()}
                state['history'].append(audit)
                write_json(checkpoint,state)
                for selection in selected:
                    if len(related_ids) >= args.max_related:
                        break
                    try:
                        doc = source_wiki.document(pageid=selection['page_id'])
                        if doc['document_id'] == own['document_id']:
                            continue
                        write_json(document_path(output, doc['document_id']), doc)
                        evidence = verify_connection(llm,item,topic,doc)
                        audit['results'].append({'document_id':doc['document_id'], 'status':'accepted' if evidence else 'no_verified_passage'})
                        if evidence:
                            related_ids.add(doc['document_id'])
                            state['links'].append({'item_id':qid, 'document_id':doc['document_id'], 'role':selection['role'],
                                                   'topic':topic['topic'], 'question':topic['question'], 'reason':selection['reason'],
                                                   'evidence':evidence, 'validation_status':'evidence_quote_verified'})
                    except Exception as error:
                        audit['results'].append({'page_id':selection['page_id'], 'status':'failed', 'error_type':type(error).__name__, 'message':safe_error(error)})
                    write_json(checkpoint,state)
            state['status'] = 'complete' if not any(r['status'] == 'failed' for h in state['history'] for r in h['results']) else 'partial'
            state['completed_at'] = now()
            report['items'].append({'item_id':qid, 'status':state['status'], 'facts':len(state['facts']), 'related_documents':len(related_ids)})
        except Exception as error:
            state.update(status='failed', failed_stage=stage, error_type=type(error).__name__, message=safe_error(error))
            report['items'].append({'item_id':qid, 'status':'failed', 'stage':stage, 'error_type':type(error).__name__})
            print(f'{name}: failed at {stage} ({type(error).__name__}); cached steps can be reused', flush=True)
        write_json(checkpoint,state)
    return export_processed(output, chosen, report)


def export_processed(output, chosen, report):
    # Preserve registered targets collected by earlier runs when exporting a subset.
    states = [read_json(output/'items'/(t[0]+'.json')) for t in TARGETS if (output/'items'/(t[0]+'.json')).exists()]
    by_id = {s['item_id']: s for s in states}
    report['items'] = [{'item_id': qid, 'status': by_id.get(qid, {}).get('status', 'failed')} for qid, *_ in chosen]
    items = [s['item'] for s in states if 'item' in s]
    facts = [f for s in states for f in s['facts']]
    links = [link for s in states for link in s['links']]
    doc_ids = {link['document_id'] for link in links}
    docs = [read_json(document_path(output, doc_id)) for doc_id in sorted(doc_ids)]
    item_ids = {item['id'] for item in items}
    available_docs = {doc['document_id'] for doc in docs}
    integrity_errors = []
    if len(item_ids) != len(items):
        integrity_errors.append('duplicate_item_ids')
    for item in items:
        if not any(link['item_id'] == item['id'] and link['role'] == 'own' for link in links):
            integrity_errors.append('missing_own_document:' + item['id'])
    for link in links:
        if link['item_id'] not in item_ids or link['document_id'] not in available_docs:
            integrity_errors.append('dangling_item_document_link')
    for fact in facts:
        if fact['item_id'] not in item_ids or fact['document_id'] not in available_docs:
            integrity_errors.append('dangling_fact_source')
    for filename, data in [('celestial_objects',items), ('documents',docs), ('facts',facts), ('item_documents',links),
                           ('research_plans',[{'item_id':s['item_id'], **s['plan']} for s in states if 'plan' in s]),
                           ('collection_history',[{'item_id':s['item_id'], 'searches':s['history']} for s in states])]:
        write_json(output/'processed'/(filename+'.json'),data)
    report['finished_at'] = now()
    report['integrity_errors'] = integrity_errors
    report['review'] = {s['item_id']:{'rejected_facts':len(s['rejected_facts']),
                                    'accepted_facts':len(s['facts']),
                                    'unresolved_fields':[c['field'] for c in s.get('plan',{}).get('coverage',[]) if c['status'] != 'found']} for s in states}
    report['requested_items'] = list(report['items'])
    requested_ids = {t[0] for t in chosen}
    report['items'].extend({'item_id':s['item_id'], 'status':'cached' if s.get('status') == 'complete' else s.get('status', 'failed')} for s in states if s['item_id'] not in requested_ids)
    report['exported_targets'] = [item['id'] for item in items]
    report['success'] = not integrity_errors and len(report['requested_items']) == len(chosen) and all(r['status'] in ('complete', 'cached') for r in report['requested_items'])
    write_json(output/'processed'/'collection_report.json',report)
    print(f"Finished: requested={len(chosen)}, exported={len(items)} items. Output: {output / 'processed'}",flush=True)
    return 0 if report['success'] else 1
