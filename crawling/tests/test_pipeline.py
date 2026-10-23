import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from solar.clients import LLM
from solar.config import TARGETS, ROOT, DEFAULT_ENV
from collect import parser
from solar.extraction import validate_facts, select
from solar.pipeline import run, wikidata_facts
from solar.wiki import Wikipedia


class FakeHTTP:
    def __init__(self, result):
        self.result = result
    def request(self, *args, **kwargs):
        return self.result


class Tests(unittest.TestCase):
    def test_default_env_is_beside_entrypoint(self):
        self.assertEqual(DEFAULT_ENV, ROOT / '.env')
        self.assertEqual(parser().parse_args([]).env_file, DEFAULT_ENV)

    def test_llm_loads_key_from_env_file(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            env = Path(directory) / '.env'
            env.write_text('GMS_KEY=offline-test-key\n', encoding='utf-8')
            with patch.dict('os.environ', {}, clear=True):
                llm = LLM(FakeHTTP({}), env)
                self.assertEqual(llm.key, 'offline-test-key')

    def test_disambiguation_links_do_not_reject_article(self):
        for properties in ({'wikibase_item':'Q525'}, {}, []):
            with self.subTest(properties=properties):
                wiki = Wikipedia(FakeHTTP({'parse':{'pageid':1, 'revid':2, 'title':'태양',
                    'properties':properties, 'text':'<p>태양 설명 <a class="mw-disambig">동음이의</a></p>'}}))
                self.assertEqual(wiki.document(title='태양')['title'], '태양')

    def test_actual_disambiguation_is_rejected(self):
        for properties in ({'disambiguation':''}, [{'name':'disambiguation', '*':''}]):
            with self.subTest(properties=properties):
                wiki = Wikipedia(FakeHTTP({'parse':{'pageid':1, 'revid':2, 'title':'동음이의',
                    'properties':properties, 'text':'<p>여러 뜻</p>'}}))
                with self.assertRaisesRegex(ValueError, 'Disambiguation'):
                    wiki.document(title='동음이의')

    def test_seed_and_units(self):
        self.assertEqual(len({t[0] for t in TARGETS}),100)
        entity = {'id':'Q405', 'claims':{'P2120':[
            {'mainsnak':{'snaktype':'value','datavalue':{'value':{'amount':'+1737.4','unit':'http://www.wikidata.org/entity/Q828224'}}},'qualifiers':{'P518':['preserve']},'rank':'normal'},
            {'mainsnak':{'snaktype':'somevalue'}, 'rank':'normal'},
            {'mainsnak':{'snaktype':'novalue'}, 'rank':'deprecated'}]}}
        facts = wikidata_facts(entity)
        self.assertEqual(len(facts),2)
        self.assertEqual(facts[0]['normalized']['value'],'1737400.0')
        self.assertEqual(facts[0]['qualifiers'],{'P518':['preserve']})
        self.assertEqual(facts[1]['value_state'],'somevalue')
        self.assertIsNone(facts[1]['value'])

    def test_evidence_rejects_hallucination(self):
        fact = {'field':'자전','value':'설명','status':'established','evidence':[{'paragraph_id':'p1','quote':'같은 면'}]}
        good,bad = validate_facts({'facts':[fact,{**fact,'evidence':[{'paragraph_id':'p1','quote':'없는 문장'}]}]},[{'id':'p1','text':'달은 같은 면을 보인다.'}],'kowiki:1','Q405')
        self.assertEqual((len(good),len(bad)),(1,1))

    def test_responses_wire_format(self):
        with patch.dict('os.environ',{'GMS_KEY':'test-placeholder'}):
            llm=LLM(FakeHTTP({'status':'completed','output':[{'type':'reasoning'},{'type':'message','content':[{'type':'output_text','text':'{"facts":[]}'}]}]}),'nonexistent.env')
            self.assertEqual(llm.json('task',{}),{'facts':[]})

    def test_parser_preserves_tables_and_revisions(self):
        wiki=Wikipedia(FakeHTTP({'parse':{'pageid':1,'revid':2,'title':'달','text':'<h2>자전</h2><p>같은 면</p><table class="infobox"><tr><td>질량</td><td>123</td></tr></table><div class="navbox"><p>불필요</p></div>'}}))
        doc=wiki.document(title='달')
        self.assertIn('질량',doc['content'])
        self.assertNotIn('불필요',doc['content'])
        self.assertEqual(doc['revision_id'],2)

    def test_selection_only_existing_ids(self):
        class Model:
            def json(self,*args):
                return {'selected':[{'page_id':999,'role':'concept','reason':'x'},{'page_id':1,'role':'concept','reason':'x'}]}
        self.assertEqual(len(select(Model(),{}, {},[{'page_id':1}])),1)

    def test_end_to_end_offline_and_resume(self):
        class Wiki:
            def __init__(self,*args): pass
            def entity(self,qid):
                return {'id':qid,'sitelinks':{'kowiki':{'title':'달'}}}
            def document(self,**kwargs):
                pid=kwargs.get('pageid',1)
                return {'page_id':pid,'document_id':f'kowiki:{pid}','title':'달' if pid==1 else '조석 고정','source_url':'https://example.test','paragraphs':[{'id':'p1','section':'개요','text':'달은 같은 면을 보인다.'}]}
            def search(self,query):
                return [{'page_id':2,'title':'조석 고정','summary':'설명'}]
        class Model:
            def __init__(self,*args): pass
            def json(self,task,data):
                if task.startswith('Extract'):
                    return {'facts':[{'field':'자전','value':'같은 면','status':'established','evidence':[{'paragraph_id':'p1','quote':'같은 면'}]}]}
                if task.startswith('Propose'):
                    return {'topics':[{'topic':'조석 고정','query':'조석 고정','reason':'자전 설명','question':'왜 같은 면?'}],'questions':[],'coverage':[]}
                if task.startswith('Select'):
                    return {'selected':[{'page_id':2,'role':'concept','reason':'자전 설명'}]}
                return {'evidence':[{'paragraph_id':'p1','quote':'같은 면'}]}
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1]) as directory:
            args=SimpleNamespace(output=Path(directory),interval=0,refresh=False,env_file=Path('none'),only=['Q405'],max_related=4)
            with patch('solar.pipeline.Wikipedia',Wiki),patch('solar.pipeline.LLM',Model):
                self.assertEqual(run(args),0)
                self.assertEqual(run(args),0)
            read=lambda name: json.loads((Path(directory)/'processed'/(name+'.json')).read_text(encoding='utf-8'))
            self.assertEqual(len(read('documents')),2)
            self.assertEqual(len(read('item_documents')),2)
            self.assertEqual(read('collection_report')['items'][0]['status'],'cached')


if __name__=='__main__':
    unittest.main()
