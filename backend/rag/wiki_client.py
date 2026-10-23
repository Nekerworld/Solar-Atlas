"""Reuse the existing Wikipedia parser with cached, serialized HTTP requests."""
from .timing import timed
import hashlib
import importlib
import json
import os
import sys
import time

import requests

from .runtime import runtime_dir, write_json


def crawler_modules():
    from django.conf import settings
    root = str(settings.BASE_DIR.parent)
    if root not in sys.path:
        sys.path.insert(0, root)
    return (importlib.import_module("crawling.solar.clients"),
            importlib.import_module("crawling.solar.wiki"))


class CachedWikiHTTP:
    # Caller holds the cross-process collection lock throughout the operation.
    def __init__(self):
        clients, _ = crawler_modules()
        self.retry_delay = clients.retry_delay
        contact = os.getenv("WIKI_CONTACT", "").strip()
        self.interval = 1.0 if contact else 6.1
        self.session = requests.Session()
        self.session.headers["User-Agent"] = clients.wiki_user_agent(contact)
        self.directory = runtime_dir() / "wiki_cache"
        self.directory.mkdir(parents=True, exist_ok=True)

    @timed('wikipedia.request_including_cache_wait_retries')
    def request(self, url, params=None):
        if url != "https://ko.wikipedia.org/w/api.php":
            raise ValueError("Only the configured Wikipedia API can be requested.")
        params = {**(params or {}), "maxlag": 5}
        key = hashlib.sha256(json.dumps([url, params], sort_keys=True).encode()).hexdigest()
        path = self.directory / f"{key}.json"
        if path.is_file() and time.time() - path.stat().st_mtime < 86400:
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                pass
        last_path = self.directory / "last_request.txt"
        for attempt in range(3):
            try:
                last = float(last_path.read_text()) if last_path.is_file() else 0
            except (OSError, ValueError):
                last = 0
            time.sleep(max(0, self.interval - (time.time() - last)))
            last_path.write_text(str(time.time()), encoding="ascii")
            try:
                response = self.session.get(url, params=params, timeout=(10, 45))
            except (requests.Timeout, requests.ConnectionError):
                if attempt == 2:
                    raise RuntimeError("Wikipedia network request failed.") from None
                time.sleep(2 ** attempt)
                continue
            if response.status_code == 429 or response.status_code >= 500:
                if attempt == 2:
                    raise RuntimeError(f"Wikipedia HTTP {response.status_code}.")
                time.sleep(self.retry_delay(response.headers.get("Retry-After"), 2 ** (attempt + 1)))
                continue
            if not response.ok:
                raise RuntimeError(f"Wikipedia HTTP {response.status_code}.")
            try:
                data = response.json()
            except ValueError:
                raise RuntimeError("Wikipedia returned invalid JSON.") from None
            if data.get("error"):
                code = data["error"].get("code", "unknown")
                if code in {"maxlag", "ratelimited", "readonly"} and attempt < 2:
                    time.sleep(max(5, self.retry_delay(response.headers.get("Retry-After"), 5)))
                    continue
                raise RuntimeError("Wikipedia API returned an error.")
            write_json(path, data)
            return data
        raise RuntimeError("Wikipedia retry limit reached.")


def wikipedia_client():
    _, wiki = crawler_modules()
    from .table_context import preserve_table_context

    class ContextWikipedia(wiki.Wikipedia):
        def document(self, *args, **kwargs):
            return preserve_table_context(super().document(*args, **kwargs))

    return ContextWikipedia(CachedWikiHTTP())
