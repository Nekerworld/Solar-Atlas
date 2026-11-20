"""F3022 지식 검색 오프라인 테스트. GMS 클라이언트를 만들지 않는다."""
import unittest
from unittest.mock import Mock, patch

from rag.knowledge_search import KnowledgeSearchError, search_knowledge

CATALOG = {
    "Q319": {"id": "Q319", "name": "목성", "type": "planet", "indexed": True},
    "Q339": {"id": "Q339", "name": "명왕성", "type": "dwarf", "indexed": False},
}


def _store(chunks=None):
    store = Mock()
    store.profiles.get.return_value = {
        "ids": ["Q319"], "documents": ["목성 메타데이터"], "metadatas": [{"item_id": "Q319"}],
    }
    rows = chunks if chunks is not None else [
        ("a", "목성은 태양계에서 가장 큰 행성이다.", {"item_id": "Q319", "title": "목성", "section": "개요",
                                             "source_url": "https://ko.wikipedia.org/wiki/목성", "revision_id": "1"}, 0.1),
    ]
    store.documents.get.return_value = {"ids": [row[0] for row in rows]}
    store.documents.count.return_value = len(rows)
    store.documents.query.return_value = {
        "ids": [[row[0] for row in rows]],
        "documents": [[row[1] for row in rows]],
        "metadatas": [[row[2] for row in rows]],
        "distances": [[row[3] for row in rows]],
    }
    return store


def _embeddings():
    embeddings = Mock()
    embeddings.embed_query.return_value = [0.1, 0.2, 0.3]
    return embeddings


class KnowledgeSearchTests(unittest.TestCase):
    def test_returns_sources_with_title_and_url(self):
        result = search_knowledge(_store(), _embeddings(), CATALOG, " 목성은 얼마나 커? ", "Q319", 3)
        self.assertEqual(result["question"], "목성은 얼마나 커?")
        source = result["sources"][0]
        self.assertEqual(source["item_name"], "목성")
        self.assertEqual(source["title"], "목성")
        self.assertTrue(source["source_url"].startswith("https://"))
        self.assertIn("가장 큰 행성", source["snippet"])

    def test_global_search_without_item(self):
        result = search_knowledge(_store(), _embeddings(), CATALOG, "가장 큰 행성은?")
        self.assertIsNone(result["item_id"])
        self.assertEqual(len(result["sources"]), 1)

    def test_unindexed_item_is_no_index_and_makes_no_embedding_request(self):
        embeddings = _embeddings()
        for item_id in ("Q339", "Q999"):
            with self.subTest(item_id=item_id), self.assertRaises(KnowledgeSearchError) as ctx:
                search_knowledge(_store(), embeddings, CATALOG, "질문", item_id)
            self.assertEqual(ctx.exception.code, "NO_INDEX")
        embeddings.embed_query.assert_not_called()

    def test_empty_catalog_is_no_index(self):
        empty = {"Q339": {"id": "Q339", "name": "명왕성", "indexed": False}}
        with self.assertRaises(KnowledgeSearchError) as ctx:
            search_knowledge(_store(), _embeddings(), empty, "질문")
        self.assertEqual(ctx.exception.code, "NO_INDEX")

    def test_embedding_failure_hides_details(self):
        embeddings = Mock()
        embeddings.embed_query.side_effect = RuntimeError("secret-key-value leaked here")
        with self.assertRaises(KnowledgeSearchError) as ctx:
            search_knowledge(_store(), embeddings, CATALOG, "질문", "Q319")
        self.assertEqual(ctx.exception.code, "EXTERNAL_API_ERROR")
        self.assertNotIn("secret", ctx.exception.message)

    def test_no_chunks_is_no_result(self):
        with self.assertRaises(KnowledgeSearchError) as ctx:
            search_knowledge(_store(chunks=[]), _embeddings(), CATALOG, "질문", "Q319")
        self.assertEqual(ctx.exception.code, "NO_RESULT")

    def test_invalid_arguments_make_no_embedding_request(self):
        embeddings = _embeddings()
        for question, top_k in [(" ", 5), ("질문", 0), ("질문", 11)]:
            with self.subTest(question=question, top_k=top_k), self.assertRaises(KnowledgeSearchError) as ctx:
                search_knowledge(_store(), embeddings, CATALOG, question, "Q319", top_k)
            self.assertEqual(ctx.exception.code, "INVALID_INPUT")
        embeddings.embed_query.assert_not_called()


class KnowledgeEndpointTests(unittest.TestCase):
    def test_missing_index_returns_no_index_without_touching_gms(self):
        from fastapi.testclient import TestClient

        import fastapi_app

        with patch("rag.store.ChromaStore", side_effect=ValueError("missing")):
            response = TestClient(fastapi_app.app).post("/api/knowledge/search/", json={"question": "목성은?"})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"]["code"], "NO_INDEX")

    def test_bad_item_id_is_rejected(self):
        from fastapi.testclient import TestClient

        import fastapi_app

        response = TestClient(fastapi_app.app).post("/api/knowledge/search/", json={"question": "목성은?", "item_id": "jupiter"})
        self.assertEqual(response.status_code, 422)
