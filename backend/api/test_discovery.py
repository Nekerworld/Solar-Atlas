"""Offline discovery routing, provenance and follow-up tests; no paid calls."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from django.test import override_settings
from rag.agent_policy import plan_request
from rag.discovery import run_discovery, validate_matches

CATALOG = {"Q2": {"id":"Q2","name":"지구","type":"planet"},
           "Q193": {"id":"Q193","name":"토성","type":"planet"}}

class Collection:
    def __init__(self, rows):
        self.rows = rows
        self.queries = []
    def get(self, where=None, include=None):
        keys = [key for key, row in self.rows.items() if not where or row["meta"]["item_id"] == where["item_id"]]
        return {"ids":keys}
    def query(self, **options):
        self.queries.append(options)
        constraint = options.get("where", {}).get("item_id")
        allowed = constraint.get("$in") if isinstance(constraint, dict) else [constraint]
        keys = [key for key,row in self.rows.items() if row["meta"]["item_id"] in allowed][:options["n_results"]]
        return {"ids":[keys], "documents":[[self.rows[key]["text"] for key in keys]],
                "metadatas":[[self.rows[key]["meta"] for key in keys]], "distances":[[0.1] * len(keys)]}

class Store:
    def __init__(self):
        self.profiles = Collection({key:{"text": f"{body['name']}의 확인된 설명", "meta":{
            "item_id":key,"name_ko":body["name"],"source_url":"https://example.org/"+key,
            "own_document_id":"kowiki:"+key[1:]}} for key,body in CATALOG.items()})
        self.documents = Collection({"doc:"+key:{"text":body["name"]+" 원문 근거", "meta":{
            "item_id":key,"document_id":"kowiki:"+key[1:],"title":body["name"],
            "source_url":"https://example.org/"+key}} for key,body in CATALOG.items()})

class Embeddings:
    def __init__(self): self.calls=[]
    def embed_query(self,text): self.calls.append(text); return [1,0,0]
    def embed_documents(self,texts): raise AssertionError("Discovery must not reindex")

class Model:
    def __init__(self): self.payloads=[]
    def json(self,prompt,data):
        self.payloads.append(data)
        return {"matches":[{"item_id":item["item_id"],"reason":"조건을 뒷받침하는 설명이에요.",
            "criteria":[{"condition_index":i,"evidence":[{"evidence_id":next(c["evidence_id"] for c in data["candidates"] if c["item_id"]==item["item_id"]),
                "quote":next(c["text"] for c in data["candidates"] if c["item_id"]==item["item_id"])}]} for i,_ in enumerate(data["conditions"])]}
            for item in data["items"]]}

def plan(narrow=False):
    return {"action":"discover","search_question":"조건으로 행성 찾기", "discovery":{
        "conditions":["조건 A"],"scope_types":["planet"],"narrow_previous":narrow}}

def run(store=None,model=None,history=None,context=None):
    return run_discovery(store=store or Store(),embeddings=Embeddings(),model=model or Model(),catalog=CATALOG,
                         item_id="Q2",question="조건에 맞는 행성은?",plan=context or plan(),history=history)

class DiscoveryTests(unittest.TestCase):
    def test_metadata_search_and_grounded_card_sources(self):
        store=Store();result=run(store=store)
        self.assertEqual(len(store.profiles.queries),1)
        self.assertEqual(len(result["cards"]),2)
        self.assertEqual(result["response_mode"],"discovery")
        source_ids={s["evidence_id"] for s in result["sources"]}
        for card in result["cards"]:
            self.assertTrue(set(card["evidence_ids"]) <= source_ids)
        self.assertIn("retrieve_metadata",result["graph_path"])

    def test_followup_restricts_ids_and_retains_old_conditions(self):
        model=Model();history=[{"discovery":{"result_ids":["Q193"],"conditions":["기존 조건"]}}]
        result=run(model=model,history=history,context=plan(True))
        self.assertEqual(result["discovery"]["evaluated_ids"],["Q193"])
        self.assertEqual(result["discovery"]["conditions"],["기존 조건","조건 A"])
        self.assertEqual(model.payloads[0]["conditions"],["기존 조건","조건 A"])

    def test_empty_previous_results_do_not_expand_to_other_bodies(self):
        model=Model();result=run(model=model,history=[{"discovery":{"result_ids":[],"conditions":["기존 조건"]}}],context=plan(True))
        self.assertEqual(result["cards"],[])
        self.assertEqual(model.payloads,[])
        self.assertNotIn("그런 천체는 없",result["answer"])

    def test_missing_previous_result_asks_for_clarification(self):
        result=run(context=plan(True))
        self.assertTrue(result["needs_clarification"])
        self.assertEqual(result["cards"],[])

    @override_settings(RAG_DISCOVERY_BATCH_SIZE=1)
    def test_batch_evidence_ids_cannot_collide(self):
        result=run();ids=[s["evidence_id"] for s in result["sources"]]
        self.assertEqual(len(set(ids)),2)
        self.assertEqual(ids,["D0_M1","D1_M1"])

    @override_settings(RAG_DISCOVERY_CANDIDATES=1)
    def test_limited_search_never_claims_exhaustive_results(self):
        result=run()
        self.assertTrue(result["discovery"]["truncated"])
        self.assertIn("전체 목록을 확인한 결과는 아니에요",result["answer"])

    def test_rejects_unknown_items_cross_item_and_missing_conditions(self):
        candidates=[{"evidence_id":"M1","item_id":"Q2","text":"원문","source":{},"record_id":"Q2"}]
        profiles=[{"metadata":{"item_id":"Q193"}}]
        match={"item_id":"Q193","reason":"짧은 설명", "criteria":[{"condition_index":0,"evidence":[{"evidence_id":"M1","quote":"원문"}]}]}
        for rows,conditions in [([match],["조건"]),([match],["조건","추가 조건"]),([{**match,"item_id":"Q999"}],["조건"])]:
            cards,sources=validate_matches({"matches":rows},candidates,profiles,conditions,CATALOG)
            self.assertEqual((cards,sources),([],[]))

    def test_rejects_invalid_quote(self):
        candidates=[{"evidence_id":"M1","item_id":"Q2","text":"실제 원문","source":{},"record_id":"Q2"}]
        match={"item_id":"Q2","reason":"짧은 설명","criteria":[{"condition_index":0,"evidence":[{"evidence_id":"M1","quote":"없는 설명"}]}]}
        cards,_=validate_matches({"matches":[match]},candidates,[{"metadata":{"item_id":"Q2"}}],["조건"],CATALOG)
        self.assertEqual(cards,[])

    def test_planner_supports_discovery_without_affecting_normal_questions(self):
        class Planner:
            def __init__(self,action):self.action=action
            def json(self,*args):return {"action":self.action,"reply":"안녕하세요" if self.action=="conversation" else "", "search_query":"행성", "target_ids":[],"discovery":plan()["discovery"]}
        for action in ["discover","retrieve","conversation"]:
            self.assertEqual(plan_request(Planner(action),CATALOG,"Q2","질문",[])["action"],action)

    def test_service_dispatches_discovery_separately(self):
        from rag.service import RAGService
        service=RAGService.__new__(RAGService);service.store=Store();service.config=SimpleNamespace(env_file="unused")
        with patch("rag.scoped_retrieval.catalog_for",return_value=CATALOG), patch("rag.model_routing.RoutedModel"), \
             patch("rag.agent_policy.plan_request",return_value=plan()), patch("rag.discovery.run_discovery",return_value={"cards":[]}) as discovery, \
             patch("rag.unified_graph.run_unified_graph") as normal:
            self.assertEqual(service.answer("Q2","조건 질문"),{"cards":[]})
            discovery.assert_called_once();normal.assert_not_called()

    def test_reference_evidence_can_support_comparison_but_not_replace_candidate(self):
        profiles=[{"metadata":{"item_id":"Q193"}}]
        candidates=[{"evidence_id":"M1","item_id":"Q193","text":"토성 수치","source":{},"record_id":"Q193"},
                    {"evidence_id":"M2","item_id":"Q2","text":"지구 수치","source":{},"record_id":"Q2"}]
        match={"item_id":"Q193","reason":"지구와 크기를 비교했어요.","criteria":[{"condition_index":0,"evidence":[
            {"evidence_id":"M1","quote":"토성 수치"},{"evidence_id":"M2","quote":"지구 수치"}]}]}
        cards,_=validate_matches({"matches":[match]},candidates,profiles,["지구보다 큼"],CATALOG,["Q2"])
        self.assertEqual(len(cards),1)
        match["criteria"][0]["evidence"].pop(0)
        cards,_=validate_matches({"matches":[match]},candidates,profiles,["지구보다 큼"],CATALOG,["Q2"])
        self.assertEqual(cards,[])

    def test_real_chroma_metadata_query_and_scoped_documents_with_fake_vectors(self):
        import tempfile
        from pathlib import Path
        from rag.config import IndexConfig
        from rag.store import ChromaStore
        from rag.dataset import Record
        fixture=Store()
        with tempfile.TemporaryDirectory() as root:
            config=IndexConfig(Path(root),Path(root)/"chroma",Path(root)/".env",dimensions=3)
            store=ChromaStore(config)
            try:
                for collection, rows in [(store.profiles,fixture.profiles.rows),(store.documents,fixture.documents.rows)]:
                    records=[Record(key,row["text"],row["meta"]) for key,row in rows.items()]
                    store.upsert(collection,records,[[1,0,0]]*len(records))
                result=run(store=store)
                self.assertEqual({card["item_id"] for card in result["cards"]},{"Q2","Q193"})
            finally:
                store.client._system.stop()
                from chromadb.api.shared_system_client import SharedSystemClient
                SharedSystemClient.clear_system_cache()
