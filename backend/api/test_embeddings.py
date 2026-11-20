from pathlib import Path
from unittest.mock import Mock, patch

import requests
from django.test import SimpleTestCase

from rag.config import IndexConfig
from rag.embeddings import GMSEmbeddings


def config(dimensions=4, batch_size=2):
    root = Path(__file__).parent
    return IndexConfig(root, root / "chroma", root / "no.env", dimensions=dimensions, batch_size=batch_size)


def reply(vectors, status=200):
    response = Mock(status_code=status)
    response.json.return_value = {"embeddings": [{"values": v} for v in vectors]}
    return response


@patch.dict("os.environ", {"GMS_KEY": "offline-test-key"}, clear=True)
class GeminiEmbeddingTests(SimpleTestCase):
    def test_model_and_dimension_rules(self):
        self.assertEqual(IndexConfig(Path("."), Path("."), Path(".")).model, "gemini-embedding-2")
        with self.assertRaisesMessage(ValueError, "gemini-embedding-2 only"):
            IndexConfig(Path("."), Path("."), Path("."), model="text-embedding-3-large").validate()

    @patch("rag.embeddings.requests.post")
    def test_documents_use_batch_endpoint_with_key_header_only(self, post):
        post.side_effect = [reply([[1, 0, 0, 0], [0, 1, 0, 0]]), reply([[0, 0, 1, 0]])]
        vectors = GMSEmbeddings(config()).embed_documents(["가", "나", "다"])
        self.assertEqual(len(vectors), 3)
        first = post.call_args_list[0]
        self.assertTrue(first.args[0].endswith("/models/gemini-embedding-2:batchEmbedContents"))
        self.assertEqual(first.kwargs["headers"]["x-goog-api-key"], "offline-test-key")
        self.assertNotIn("offline-test-key", str(first.kwargs["json"]))
        body = first.kwargs["json"]["requests"][0]
        self.assertEqual((body["model"], body["taskType"], body["outputDimensionality"]),
                         ("models/gemini-embedding-2", "RETRIEVAL_DOCUMENT", 4))
        self.assertEqual(len(first.kwargs["json"]["requests"]), 2)

    @patch("rag.embeddings.requests.post")
    def test_query_uses_query_task_type(self, post):
        post.return_value = reply([[0.5, 0.5, 0, 0]])
        self.assertEqual(GMSEmbeddings(config()).embed_query("질문"), [0.5, 0.5, 0, 0])
        self.assertEqual(post.call_args.kwargs["json"]["requests"][0]["taskType"], "RETRIEVAL_QUERY")

    @patch("rag.embeddings.time.sleep")
    @patch("rag.embeddings.requests.post")
    def test_retries_transient_errors_but_not_auth_errors(self, post, _sleep):
        post.side_effect = [Mock(status_code=503), requests.Timeout(), reply([[1, 0, 0, 0]])]
        self.assertEqual(GMSEmbeddings(config()).embed_query("질문"), [1, 0, 0, 0])
        post.reset_mock(side_effect=True)
        post.return_value = Mock(status_code=401)
        with self.assertRaisesMessage(RuntimeError, "HTTP 401"):
            GMSEmbeddings(config()).embed_query("질문")
        self.assertEqual(post.call_count, 1)

    @patch("rag.embeddings.time.sleep")
    @patch("rag.embeddings.requests.post")
    def test_failure_message_hides_key_and_body(self, post, _sleep):
        post.return_value = Mock(status_code=429, text="secret-body offline-test-key")
        with self.assertRaises(RuntimeError) as caught:
            GMSEmbeddings(config(), max_retries=1).embed_query("질문")
        self.assertNotIn("offline-test-key", str(caught.exception))
        self.assertNotIn("secret-body", str(caught.exception))

    @patch("rag.embeddings.requests.post")
    def test_rejects_bad_vectors_and_inputs(self, post):
        client = GMSEmbeddings(config())
        for bad in ([[1, 0, 0]], [[0, 0, 0, 0]], [[1, 0, 0, float("nan")]]):
            post.return_value = reply(bad)
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                client.embed_query("질문")
        with self.assertRaises(ValueError):
            client.embed_documents(["  "])
        with self.assertRaises(ValueError):
            client.embed_documents(["가" * 3000])

    def test_missing_key_is_reported_without_request(self):
        with patch.dict("os.environ", {}, clear=True), patch("rag.embeddings.requests.post") as post:
            with self.assertRaisesMessage(ValueError, "GMS_KEY is missing"):
                GMSEmbeddings(config())
        post.assert_not_called()
