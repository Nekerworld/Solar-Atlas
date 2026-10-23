from .timing import timed
import math
import os


GMS_BASE_URL = "https://gms.ssafy.io/gmsapi/api.openai.com/v1"


class GMSEmbeddings:
    """LangChain embedding interface, shared by indexing and future query nodes."""

    @timed('embedding.initialize')
    def __init__(self, config):
        from dotenv import load_dotenv
        from langchain_openai import OpenAIEmbeddings

        load_dotenv(config.env_file, override=False)
        key = os.getenv("GMS_KEY", "").strip()
        if not key:
            raise ValueError(f"GMS_KEY is missing. Check {config.env_file.name}.")
        self.dimensions = config.dimensions
        self.client = OpenAIEmbeddings(
            api_key=key,
            base_url=GMS_BASE_URL,
            model=config.model,
            dimensions=config.dimensions,
            check_embedding_ctx_length=False,
            model_kwargs={"encoding_format": "float"},
            chunk_size=config.batch_size,
            max_retries=3,
            request_timeout=90,
        )

    @timed('embedding.request_and_validate')
    def embed_documents(self, texts):
        if not texts or any(not text.strip() for text in texts):
            raise ValueError("Embedding input must contain nonempty strings.")
        # One token cannot consume less than one UTF-8 byte. This conservative
        # upper bound avoids a tokenizer download and oversized GMS requests.
        if any(len(text.encode("utf-8")) > 8191 for text in texts):
            raise ValueError(
                "Embedding text exceeds the conservative 8191-byte limit. "
                "Reduce --chunk-size or shorten the item's search_text."
            )
        try:
            vectors = self.client.embed_documents(texts)
        except Exception as error:
            # Do not print SDK exception bodies, request headers, or API keys.
            status = getattr(error, "status_code", None)
            label = f"HTTP {status}" if status is not None else type(error).__name__
            raise RuntimeError(f"GMS embedding request failed ({label}). Re-run to resume.") from None
        if len(vectors) != len(texts):
            raise ValueError("GMS returned an unexpected number of vectors.")
        for vector in vectors:
            if len(vector) != self.dimensions or not all(
                isinstance(value, (int, float)) and math.isfinite(value) for value in vector
            ) or not any(vector):
                raise ValueError("GMS returned an invalid embedding vector/dimension.")
        return vectors

    def embed_query(self, text):
        return self.embed_documents([text])[0]
