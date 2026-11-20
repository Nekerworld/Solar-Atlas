"""GMS 접속 상수. 엔드포인트와 모델은 코드에 고정하고, 키만 환경변수(GMS_KEY, 없으면 GMS_API_KEY)로 받는다.

- 답변 생성(LLM): Anthropic 경로의 OpenAI 호환 chat completions, 모델 claude-haiku-5-5
  (`Authorization`과 `x-api-key` 헤더를 함께 보낸다)
- 임베딩(색인·질문): Gemini 경로의 `gemini-embedding-2`(`batchEmbedContents`, 헤더 `x-goog-api-key`), 기본 3072차원.
  임베딩 모델을 바꾸면 기존 Chroma 색인과 섞을 수 없어 새로 색인해야 한다(`rag/store.py`가 서명을 비교해 거부한다).
"""
import os

GMS_LLM_BASE_URL = "https://gms.ssafy.io/gmsapi/api.anthropic.com/v1"
GMS_CHAT_URL = f"{GMS_LLM_BASE_URL}/chat/completions"
GMS_MODEL = "claude-haiku-5-5"
GMS_MAX_TOKENS = 4096

GMS_EMBEDDING_MODEL = "gemini-embedding-2"
GMS_EMBEDDING_URL = f"https://gms.ssafy.io/gmsapi/generativelanguage.googleapis.com/v1beta/models/{GMS_EMBEDDING_MODEL}"


def gms_api_key():
    """GMS 키. GMS_KEY를 먼저 보고, 없으면 GMS 안내의 GMS_API_KEY를 쓴다."""
    return (os.getenv("GMS_KEY") or os.getenv("GMS_API_KEY") or "").strip()
