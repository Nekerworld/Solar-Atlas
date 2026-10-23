"""Offline tests: generated fixtures and fake embeddings, never GMS requests."""
import json
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

from rag.chunking import chunk_document
from rag.config import IndexConfig
from rag.dataset import ItemPlan, Record, build_plans
from rag.indexing import index_plans


class FakeEmbeddings:
    def __init__(self, fail_on=None):
        self.calls = []
        self.fail_on = fail_on

    def embed_documents(self, texts):
        self.calls.append(texts)
        if len(self.calls) == self.fail_on:
            raise RuntimeError("simulated interruption")
        return [[1.0, float(len(text)), 0.25] for text in texts]


class FakeCollection:
    def __init__(self, name):
        self.name = name
        self.rows = {}

    def get(self, where, include):
        rows = [(key, row) for key, row in self.rows.items() if row["metadata"]["item_id"] == where["item_id"]]
        return {"ids": [key for key, _ in rows], "metadatas": [row["metadata"] for _, row in rows]}

    def upsert(self, ids, embeddings, documents, metadatas):
        for key, vector, text, metadata in zip(ids, embeddings, documents, metadatas):
            self.rows[key] = {"metadata": metadata, "vector": vector, "text": text}

    def delete(self, ids):
        for key in ids:
            self.rows.pop(key, None)


class FakeStore:
    def __init__(self):
        from rag.store import ChromaStore
        self.profiles = FakeCollection("profiles")
        self.documents = FakeCollection("documents")
        self.existing = ChromaStore.existing
        self.upsert = ChromaStore.upsert
        self.delete_obsolete = ChromaStore.delete_obsolete


def config(root):
    return IndexConfig(Path(root), Path(root) / "chroma", Path(root) / ".env", dimensions=3, batch_size=1)


def plan(item_id="Q405", chunks=2):
    return ItemPlan(
        item_id, "달", Record(item_id, "달 메타데이터", {"item_id": item_id}),
        [Record(f"{item_id}:doc:{i:04d}", f"본문 {i}", {"item_id": item_id}) for i in range(chunks)], 1,
    )


class ChunkTests(unittest.TestCase):
    def test_section_boundaries_length_and_complete_coverage(self):
        body = "".join(chr(0x4e00 + i) for i in range(250))
        document = {"paragraphs": [
            {"id": "p1", "section": "크기", "text": body},
            {"id": "p2", "section": "기원", "text": "달의 기원"},
            {"id": "p3", "section": "각주", "text": "제외할 각주"},
        ]}
        chunks = chunk_document(document, 100, 20)
        first = [c for c in chunks if c["section"] == "크기"]
        restored = first[0]["text"] + "".join(c["text"][20:] for c in first[1:])
        self.assertEqual(restored, body)
        self.assertTrue(all(len(c["text"]) <= 100 for c in chunks))
        self.assertEqual(chunks[-1]["paragraph_ids"], ["p2"])
        self.assertFalse(any("제외할" in c["text"] for c in chunks))

    def test_overlap_validation(self):
        with self.assertRaises(ValueError):
            chunk_document({}, 100, 100)


class DatasetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.items = [{
            "id": "Q405", "name_ko": "달", "type": "natural_satellite", "search_text": "달은 지구의 위성",
            "own_document_id": "kowiki:1", "wikipedia_url": "https://ko.wikipedia.org/wiki/달",
            "wikidata_url": "https://www.wikidata.org/wiki/Q405",
        }]
        self.documents = [{
            "document_id": "kowiki:1", "title": "달", "source_url": "https://example.org/moon",
            "revision_url": "https://example.org/moon?oldid=1", "revision_id": 1,
            "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
            "raw_html": "DO NOT EMBED HTML", "content": "DO NOT EMBED CONTENT WHEN PARAGRAPHS EXIST",
            "paragraphs": [{"id": "p1", "section": "개요", "text": "달은 지구의 자연위성이다."}],
        }]
        self.links = [
            {"item_id": "Q405", "document_id": "kowiki:1", "role": "own"},
            {"item_id": "Q405", "document_id": "kowiki:1", "role": "concept"},
        ]

    def write(self, status="complete"):
        for name, value in [
            ("celestial_objects", self.items), ("documents", self.documents),
            ("item_documents", self.links),
            ("collection_report", {"items": [{"item_id": "Q405", "status": status}]}),
        ]:
            (self.root / f"{name}.json").write_text(json.dumps(value), encoding="utf-8")

    def test_duplicate_topics_produce_one_document_and_preserve_roles(self):
        self.write()
        plans, skipped = build_plans(config(self.root))
        self.assertEqual(skipped, [])
        self.assertEqual(plans[0].document_count, 1)
        self.assertEqual(len(plans[0].chunks), 1)
        record = plans[0].chunks[0]
        self.assertEqual(record.id, "Q405:kowiki:1:0000")
        self.assertEqual(record.text, "달은 지구의 자연위성이다.")
        self.assertEqual(record.metadata["role"], "own")
        self.assertEqual(record.metadata["roles"], "concept,own")

    def test_incomplete_explicit_selection_fails_before_api(self):
        self.write("failed")
        with self.assertRaisesRegex(ValueError, "not complete"):
            build_plans(config(self.root), ["Q405"])

    def test_missing_own_document_is_rejected(self):
        self.links = []
        self.write()
        with self.assertRaisesRegex(ValueError, "own document"):
            build_plans(config(self.root))

    def test_bilingual_failure_recovers_only_proven_complete_base(self):
        self.write("partial")
        directory = self.root.parent / "items"
        directory.mkdir(exist_ok=True)
        checkpoint = directory / "Q405.json"
        self.addCleanup(lambda: checkpoint.unlink(missing_ok=True))
        state = {"item_id": "Q405", "item": self.items[0], "bilingual_failure": True,
                 "status_before_bilingual": "complete"}
        checkpoint.write_text(json.dumps(state), encoding="utf-8")
        plans, _ = build_plans(config(self.root), ["Q405"])
        self.assertEqual(len(plans), 1)
        self.assertTrue(plans[0].warnings)
        state["status_before_bilingual"] = "partial"
        checkpoint.write_text(json.dumps(state), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "not complete"):
            build_plans(config(self.root), ["Q405"])

    def test_english_own_source_requires_explicit_option(self):
        self.documents[0]["document_id"] = "enwiki:1"
        self.items[0]["own_document_id"] = "enwiki:1"
        for link in self.links:
            link["document_id"] = "enwiki:1"
        self.write()
        with self.assertRaisesRegex(ValueError, "include-english-originals"):
            build_plans(config(self.root))
        plans, _ = build_plans(config(self.root), include_english_originals=True)
        metadata = plans[0].chunks[0].metadata
        self.assertEqual(metadata["index_language"], "en")
        self.assertFalse(metadata["is_translation"])

    def test_unknown_selection_rejected(self):
        self.write()
        with self.assertRaisesRegex(ValueError, "Unknown"):
            build_plans(config(self.root), ["Q339"])


class IndexTests(unittest.TestCase):
    def test_rerun_reuses_vectors_and_preserves_other_items(self):
        store, embed = FakeStore(), FakeEmbeddings()
        c = config(".")
        index_plans(c, [plan("Q2"), plan()], store, embed)
        calls = len(embed.calls)
        totals = index_plans(c, [plan()], store, embed)
        self.assertEqual(len(embed.calls), calls)
        self.assertEqual(totals["reused"], 3)
        self.assertIn("Q2:doc:0000", store.documents.rows)

    def test_old_chunks_removed_after_successful_update(self):
        store, embed = FakeStore(), FakeEmbeddings()
        index_plans(config("."), [plan()], store, embed)
        totals = index_plans(config("."), [plan(chunks=1)], store, embed)
        self.assertEqual(totals["deleted"], 1)
        self.assertNotIn("Q405:doc:0001", store.documents.rows)

    def test_failed_batch_preserves_old_records_and_can_resume(self):
        store = FakeStore()
        index_plans(config("."), [plan(chunks=3)], store, FakeEmbeddings())
        changed = plan(chunks=2)
        changed.chunks[0] = replace(changed.chunks[0], text="변경된 본문")
        with self.assertRaisesRegex(RuntimeError, "interruption"):
            index_plans(config("."), [changed], store, FakeEmbeddings(fail_on=1))
        self.assertIn("Q405:doc:0002", store.documents.rows)
        totals = index_plans(config("."), [changed], store, FakeEmbeddings())
        self.assertEqual(totals["embedded"], 1)
        self.assertEqual(totals["deleted"], 1)

    def test_chroma_storage_and_query_with_fake_vectors(self):
        # Local DB integration only. No GMS or external embedding model is used.
        from rag.store import ChromaStore

        with tempfile.TemporaryDirectory() as directory:
            c = config(directory)
            store = ChromaStore(c)
            try:
                index_plans(c, [plan()], store, FakeEmbeddings())
                self.assertEqual(store.profiles.count(), 1)
                self.assertEqual(store.documents.count(), 2)
                result = store.documents.query(
                    query_embeddings=[[1.0, 4.0, 0.25]], n_results=1,
                    where={"item_id": "Q405"}, include=["documents", "metadatas"],
                )
                self.assertEqual(result["metadatas"][0][0]["item_id"], "Q405")
                second = ChromaStore(c)
                self.assertEqual(second.documents.count(), 2)
                with self.assertRaisesRegex(ValueError, "different/unknown"):
                    ChromaStore(replace(c, dimensions=4))
            finally:
                # Test-only Chroma system shutdown releases Windows file handles.
                store.client._system.stop()
                from chromadb.api.shared_system_client import SharedSystemClient
                SharedSystemClient.clear_system_cache()
