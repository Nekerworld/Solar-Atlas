"""Shared entry point for management commands and the Django chat API."""
from .timing import timed

from .config import IndexConfig


class RAGService:
    @timed('service.initialize')
    def __init__(self, config=None):
        from .store import ChromaStore
        self.config = config or IndexConfig.from_django()
        self.store = ChromaStore(self.config, create=False)

    @timed('item.validate')
    def require_item(self, item_id):
        profile = self.store.profiles.get(ids=[item_id], include=["metadatas"])
        if not profile["ids"]:
            raise ValueError("Selected item has not been indexed.")
        return profile["metadatas"][0]

    @timed('rag.total')
    def answer(self, item_id, question, *, allow_external=True, history=None,
               candidates=12, max_evidence=8, progress=None):
        from .collection import WikipediaCollector
        from .embeddings import GMSEmbeddings
        from .model_routing import RoutedModel
        from .unified_graph import run_unified_graph
        from .scoped_retrieval import catalog_for
        from .agent_policy import plan_request, conversational_result

        if not question.strip() or not 1 <= candidates <= 20 or not 1 <= max_evidence <= 12:
            raise ValueError("Invalid question or retrieval limits")
        config = self.config

        class Embeddings:
            client = None

            def __init__(self):
                # Request-local only: no cross-user state or stale document cache.
                self.query_vectors = {}

            def _client(self):
                if self.client is None:
                    self.client = GMSEmbeddings(config)
                return self.client

            @timed('query_embedding.total')
            def embed_query(self, text):
                if text not in self.query_vectors:
                    self.query_vectors[text] = self._client().embed_query(text)
                return list(self.query_vectors[text])

            @timed('document_embedding.total')
            def embed_documents(self, texts):
                return self._client().embed_documents(texts)

        embeddings, model = Embeddings(), RoutedModel(config.env_file)
        if progress:
            progress("NODE: conversation")
        catalog = catalog_for(self.config, self.store)
        plan = plan_request(model, catalog, item_id, question, history)
        if plan["action"] == "discover":
            from .discovery import run_discovery
            return run_discovery(store=self.store, embeddings=embeddings, model=model,
                catalog=catalog, item_id=item_id, question=question, plan=plan,
                history=history, progress=progress)
        if plan["action"] != "retrieve":
            return conversational_result(plan, item_id, question)
        if plan.get("requires_comparison") or plan.get("reasoning_complexity") == "high":
            model.escalate("complex_plan")
        collector = WikipediaCollector(config, self.store, embeddings, model) if allow_external else None
        return run_unified_graph(self.store, embeddings, model, catalog, item_id, question,
                                candidates=candidates, max_evidence=max_evidence, history=history,
                                progress=progress, collector=collector, plan=plan)
