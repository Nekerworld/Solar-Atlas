"""Opt-in isolated Django/Chroma state for live Atlas evaluations."""
import os
from pathlib import Path
from .settings import *  # noqa: F403

EVALUATION_ROOT = Path(os.environ.get("ATLAS_EVAL_ROOT", BASE_DIR / "evaluations" / "runtime"))
EVALUATION_ROOT.mkdir(parents=True, exist_ok=True)
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": EVALUATION_ROOT / "chat.sqlite3"}}
RAG_INDEX = {**RAG_INDEX, "chroma_dir": EVALUATION_ROOT / "chroma"}
RAG_RUNTIME_DIR = EVALUATION_ROOT / "rag_runtime"
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]
