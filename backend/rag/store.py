"""Persistent Chroma storage; no automatic/default embedding model."""
from pathlib import Path


class ChromaStore:
    def __init__(self, config, *, create=True):
        import chromadb
        from chromadb.config import Settings

        if not create and not (Path(config.chroma_dir) / "chroma.sqlite3").is_file():
            raise ValueError("Chroma index is missing. Run index_solar first.")
        self.client = chromadb.PersistentClient(
            path=str(config.chroma_dir), settings=Settings(anonymized_telemetry=False),
        )
        self.signature = {
            "embedding_model": config.model,
            "embedding_dimensions": config.dimensions,
            "index_schema": "solar-v1",
            "distance_metric": "cosine",
        }
        self.profiles = self._collection(config.metadata_collection, create=create)
        self.documents = self._collection(config.document_collection, create=create)

    def _collection(self, name, *, create=True):
        if create:
            collection = self.client.get_or_create_collection(
                name=name,
                embedding_function=None,
                metadata=self.signature,
                configuration={"hnsw": {"space": "cosine"}},
            )
        else:
            from chromadb.errors import NotFoundError

            try:
                collection = self.client.get_collection(name=name, embedding_function=None)
            except NotFoundError:
                raise ValueError(f"Collection {name} is missing. Run index_solar first.") from None
        stored = collection.metadata or {}
        if any(stored.get(key) != value for key, value in self.signature.items()):
            raise ValueError(
                f"Collection {name} uses different/unknown embedding settings. "
                "Choose a new --chroma-dir instead of mixing vectors."
            )
        return collection

    @staticmethod
    def existing(collection, item_id):
        result = collection.get(where={"item_id": item_id}, include=["metadatas"])
        return dict(zip(result["ids"], result["metadatas"]))

    @staticmethod
    def upsert(collection, records, vectors):
        collection.upsert(
            ids=[r.id for r in records],
            embeddings=vectors,
            documents=[r.text for r in records],
            metadatas=[{**r.metadata, "record_hash": r.fingerprint} for r in records],
        )

    @staticmethod
    def delete_obsolete(collection, existing, records, batch_size):
        # A seed re-index must not erase documents gathered by chat requests.
        stale = sorted(key for key in set(existing) - {r.id for r in records}
                       if (existing[key] or {}).get("origin") != "question")
        for start in range(0, len(stale), batch_size):
            collection.delete(ids=stale[start:start + batch_size])
        return len(stale)
