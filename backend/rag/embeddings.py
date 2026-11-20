from .timing import timed
import math
import time

import requests

from .gms import GMS_EMBEDDING_MODEL, GMS_EMBEDDING_URL, gms_api_key


class GMSEmbeddings:
    """LangChain 임베딩 인터페이스(embed_documents/embed_query). 색인과 질문 검색이 함께 쓴다.

    GMS의 Gemini 경로(`gemini-embedding-2`)를 `batchEmbedContents`로 호출한다. 색인 문서는
    RETRIEVAL_DOCUMENT, 질문은 RETRIEVAL_QUERY로 보낸다. 키는 헤더(`x-goog-api-key`)로만 보낸다.
    """

    @timed('embedding.initialize')
    def __init__(self, config, *, timeout=90, max_retries=3):
        from dotenv import load_dotenv

        load_dotenv(config.env_file, override=False)
        key = gms_api_key()
        if not key:
            raise ValueError(f"GMS_KEY is missing. Check {config.env_file.name}.")
        self.key = key
        self.dimensions = config.dimensions
        self.batch_size = config.batch_size
        self.timeout = timeout
        self.max_retries = max(0, max_retries)

    def _post(self, texts, task_type):
        body = {"requests": [{
            "model": f"models/{GMS_EMBEDDING_MODEL}",
            "content": {"parts": [{"text": text}]},
            "taskType": task_type,
            "outputDimensionality": self.dimensions,
        } for text in texts]}
        headers = {"Content-Type": "application/json", "x-goog-api-key": self.key}
        label = "unknown"
        for attempt in range(self.max_retries + 1):
            try:
                response = requests.post(f"{GMS_EMBEDDING_URL}:batchEmbedContents", headers=headers, json=body, timeout=self.timeout)
            except requests.RequestException as error:
                label = type(error).__name__
            else:
                if response.status_code == 200:
                    try:
                        return response.json()
                    except ValueError:
                        label = "unreadable response"
                        break
                label = f"HTTP {response.status_code}"
                # 전송 오류·5xx·일시적 429만 다시 시도한다. 그 밖의 4xx(인증·요청 오류)는 바로 멈춘다.
                if response.status_code < 500 and response.status_code != 429:
                    break
            if attempt < self.max_retries:
                time.sleep(min(2 ** (attempt + 1), 8))
        # 응답 본문, 요청 헤더, API 키는 출력하지 않는다.
        raise RuntimeError(f"GMS embedding request failed ({label}). Re-run to resume.") from None

    def _embed(self, texts, task_type):
        if not texts or any(not text.strip() for text in texts):
            raise ValueError("Embedding input must contain nonempty strings.")
        # One token cannot consume less than one UTF-8 byte. This conservative
        # upper bound avoids a tokenizer download and oversized GMS requests.
        if any(len(text.encode("utf-8")) > 8191 for text in texts):
            raise ValueError(
                "Embedding text exceeds the conservative 8191-byte limit. "
                "Reduce --chunk-size or shorten the item's search_text."
            )
        vectors = []
        for start in range(0, len(texts), self.batch_size):
            batch = texts[start:start + self.batch_size]
            payload = self._post(batch, task_type)
            embeddings = payload.get("embeddings") if isinstance(payload, dict) else None
            if not isinstance(embeddings, list) or len(embeddings) != len(batch):
                raise ValueError("GMS returned an unexpected number of vectors.")
            vectors.extend(item.get("values") if isinstance(item, dict) else None for item in embeddings)
        for vector in vectors:
            if not isinstance(vector, list) or len(vector) != self.dimensions or not all(
                isinstance(value, (int, float)) and math.isfinite(value) for value in vector
            ) or not any(vector):
                raise ValueError("GMS returned an invalid embedding vector/dimension.")
        return vectors

    @timed('embedding.request_and_validate')
    def embed_documents(self, texts):
        return self._embed(texts, "RETRIEVAL_DOCUMENT")

    def embed_query(self, text):
        return self._embed([text], "RETRIEVAL_QUERY")[0]
