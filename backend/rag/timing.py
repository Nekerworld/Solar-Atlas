"""Temporary, opt-out wall-clock diagnostics; never log prompts or credentials."""
from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps
import logging
import os
from time import perf_counter
from uuid import uuid4

_trace = ContextVar("rag_timing_trace", default=None)
_path = ContextVar("rag_timing_path", default=())
_logger = logging.getLogger("rag.timing")
# Visible in runserver and management commands without changing Django logging.
if not _logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(handler)
_logger.setLevel(logging.INFO)
_logger.propagate = False


@contextmanager
def measure(name):
    if os.getenv("RAG_TIMING", "1").lower() in {"0", "false", "off"}:
        yield
        return
    trace_token = None
    if _trace.get() is None:
        trace_token = _trace.set(uuid4().hex[:12])
    path = (*_path.get(), name)
    path_token = _path.set(path)
    trace, label = _trace.get(), "/".join(path)
    start = perf_counter()
    status = "ok"
    _logger.info("[RAG TIMING %s] START %s", trace, label)
    try:
        yield
    except BaseException:
        status = "error"
        raise
    finally:
        _logger.info("[RAG TIMING %s] END %s elapsed=%.3fs status=%s",
                     trace, label, perf_counter() - start, status)
        _path.reset(path_token)
        if trace_token is not None:
            _trace.reset(trace_token)


def timed(name):
    def decorate(function):
        @wraps(function)
        def wrapped(*args, **kwargs):
            with measure(name):
                return function(*args, **kwargs)
        return wrapped
    return decorate
