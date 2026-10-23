"""Offline retrieval tests. Never construct a GMS client."""
import unittest
from unittest.mock import Mock

from rag.retrieval import retrieve


class RetrievalTests(unittest.TestCase):
    def setUp(self):
        self.store = Mock()
        self.embeddings = Mock()
        self.embeddings.embed_query.return_value = [0.1, 0.2, 0.3]
        self.store.profiles.get.return_value = {
            "ids": ["Q405"], "documents": ["달 메타데이터"],
            "metadatas": [{"item_id": "Q405"}],
        }
        self.store.documents.get.return_value = {"ids": ["a", "b", "c"]}
        self.store.documents.query.return_value = {
            "ids": [["a", "b", "c"]],
            "documents": [["크레이터는 충돌로 형성된다.", "크레이터는  충돌로 형성된다.", "달의 바다에는 현무암이 있다."]],
            "metadatas": [[{"item_id": "Q405", "source_url": "https://example.org/moon"}] * 3],
            "distances": [[0.1, 0.2, 0.3]],
        }

    def test_question_embedding_scoped_search_and_duplicate_removal(self):
        result = retrieve(self.store, self.embeddings, "Q405", " 크레이터의 기원은? ", 2)
        self.embeddings.embed_query.assert_called_once_with("크레이터의 기원은?")
        self.store.documents.query.assert_called_once_with(
            query_embeddings=[[0.1, 0.2, 0.3]], n_results=3,
            where={"item_id": "Q405"}, include=["documents", "metadatas", "distances"],
        )
        self.assertEqual([c["id"] for c in result["chunks"]], ["a", "c"])
        self.assertEqual(result["profile"]["text"], "달 메타데이터")
        self.assertEqual(result["chunks"][0]["metadata"]["source_url"], "https://example.org/moon")
        self.store.documents.upsert.assert_not_called()

    def test_missing_item_makes_no_embedding_request(self):
        self.store.profiles.get.return_value = {"ids": []}
        with self.assertRaisesRegex(ValueError, "not indexed"):
            retrieve(self.store, self.embeddings, "Q339", "질문")
        self.embeddings.embed_query.assert_not_called()

    def test_no_chunks_makes_no_embedding_request(self):
        self.store.documents.get.return_value = {"ids": []}
        with self.assertRaisesRegex(ValueError, "no indexed chunks"):
            retrieve(self.store, self.embeddings, "Q405", "질문")
        self.embeddings.embed_query.assert_not_called()

    def test_invalid_arguments_make_no_embedding_request(self):
        for question, top_k in [(" ", 5), ("질문", 0), ("질문", 21)]:
            with self.subTest(question=question, top_k=top_k), self.assertRaises(ValueError):
                retrieve(self.store, self.embeddings, "Q405", question, top_k)
        self.embeddings.embed_query.assert_not_called()

    def test_different_item_in_results_is_rejected(self):
        self.store.documents.query.return_value["metadatas"][0][0] = {"item_id": "Q2"}
        with self.assertRaisesRegex(ValueError, "different item"):
            retrieve(self.store, self.embeddings, "Q405", "질문")

    def test_missing_database_does_not_create_it(self):
        import tempfile
        from pathlib import Path
        from rag.config import IndexConfig
        from rag.store import ChromaStore

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            missing = root / "missing"
            config = IndexConfig(root, missing, root / ".env")
            with self.assertRaisesRegex(ValueError, "index is missing"):
                ChromaStore(config, create=False)
            self.assertFalse(missing.exists())

    def test_existing_chroma_filters_out_other_items(self):
        import tempfile
        from api.test_indexing import config, plan, FakeEmbeddings
        from rag.indexing import index_plans
        from rag.store import ChromaStore
        from chromadb.api.shared_system_client import SharedSystemClient

        with tempfile.TemporaryDirectory() as directory:
            c = config(directory)
            store = ChromaStore(c)
            try:
                index_plans(c, [plan("Q405"), plan("Q2")], store, FakeEmbeddings())
                reader = ChromaStore(c, create=False)
                embed = Mock()
                embed.embed_query.return_value = [1.0, 4.0, 0.25]
                result = retrieve(reader, embed, "Q405", "달에 관한 질문", 5)
                self.assertEqual(result["indexed_chunks"], 2)
                self.assertEqual(len(result["chunks"]), 2)
                self.assertTrue(all(c["metadata"]["item_id"] == "Q405" for c in result["chunks"]))
                self.assertEqual(reader.documents.count(), 4)
            finally:
                store.client._system.stop()
                SharedSystemClient.clear_system_cache()
