from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class IndexConfig:
    data_dir: Path
    chroma_dir: Path
    env_file: Path
    model: str = "text-embedding-3-large"
    dimensions: int = 3072
    chunk_size: int = 1000
    chunk_overlap: int = 150
    batch_size: int = 16
    metadata_collection: str = "celestial_metadata"
    document_collection: str = "external_documents"

    def validate(self):
        if self.model != "text-embedding-3-large":
            raise ValueError("This indexing pipeline permits text-embedding-3-large only")
        if not 100 <= self.chunk_size <= 6000:
            raise ValueError("chunk_size must be between 100 and 6000 characters.")
        if not 0 <= self.chunk_overlap < self.chunk_size:
            raise ValueError("chunk_overlap must be >= 0 and smaller than chunk_size.")
        if not 1 <= self.batch_size <= 128:
            raise ValueError("batch_size must be between 1 and 128.")
        if not 1 <= self.dimensions <= 3072:
            raise ValueError("dimensions must be between 1 and 3072.")
        if self.metadata_collection == self.document_collection:
            raise ValueError("Metadata and document collections must be different.")

    @classmethod
    def from_django(cls, **overrides):
        from django.conf import settings

        options = dict(settings.RAG_INDEX)
        options.update({k: v for k, v in overrides.items() if v is not None})
        for key in ("data_dir", "chroma_dir", "env_file"):
            options[key] = Path(options[key]).expanduser().resolve()
        result = cls(**options)
        result.validate()
        return result
