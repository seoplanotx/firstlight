"""Local-request guard for the loopback API.

The backend listens on 127.0.0.1 with no user login, so two browser-borne
attacks have to be closed explicitly:

* **DNS rebinding** — a hostile page rebinds its own domain to 127.0.0.1 and
  can then *read* responses (e.g. the full data export). Every request whose
  ``Host`` header is not a loopback name is rejected.
* **Cross-site requests** — any open web page can fire a "simple" POST at
  127.0.0.1 (e.g. ``/api/data/delete``) even though CORS stops it reading the
  reply. Browsers always attach ``Origin`` to such requests, so any request
  carrying an ``Origin`` outside the desktop app's own origins is rejected
  before it reaches a route.

Requests with no ``Origin`` (the Claude Desktop MCP extension, curl, tests)
are still allowed; they cannot come from a web page.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable, Iterable
from typing import Any

# Origins of the desktop UI: Vite dev server (1420) / e2e (1421), the Tauri
# webview on macOS/Linux (tauri://localhost) and on Windows (http(s)://tauri.localhost).
ALLOWED_ORIGINS: tuple[str, ...] = (
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "http://localhost:1421",
    "http://127.0.0.1:1421",
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
)

# "testserver" is the Host FastAPI's TestClient sends; it is not a resolvable
# public name, so allowing it gives a rebinding attacker nothing.
ALLOWED_HOSTNAMES: frozenset[str] = frozenset({"127.0.0.1", "localhost", "::1", "testserver"})

Scope = dict[str, Any]
Receive = Callable[[], Awaitable[dict[str, Any]]]
Send = Callable[[dict[str, Any]], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]


def _hostname(host_header: str) -> str:
    host = host_header.strip().lower()
    if host.startswith("["):  # IPv6 literal, e.g. "[::1]:17845"
        return host[1:].split("]", 1)[0]
    return host.rsplit(":", 1)[0] if host.count(":") == 1 else host


def is_allowed_host(host_header: str | None) -> bool:
    if not host_header:
        return False
    return _hostname(host_header) in ALLOWED_HOSTNAMES


def is_allowed_origin(origin: str | None, allowed: Iterable[str] = ALLOWED_ORIGINS) -> bool:
    if origin is None:
        return True
    return origin.strip().rstrip("/").lower() in {item.lower() for item in allowed}


class LocalRequestGuardMiddleware:
    def __init__(self, app: ASGIApp, allowed_origins: Iterable[str] = ALLOWED_ORIGINS) -> None:
        self.app = app
        self.allowed_origins = tuple(allowed_origins)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in {"http", "websocket"}:
            await self.app(scope, receive, send)
            return

        headers = {key.decode("latin-1").lower(): value.decode("latin-1") for key, value in scope.get("headers", [])}
        if not is_allowed_host(headers.get("host")):
            await self._reject(scope, send, "Requests must be addressed to this computer's local Firstlight service.")
            return
        if not is_allowed_origin(headers.get("origin"), self.allowed_origins):
            await self._reject(scope, send, "Requests from other websites are not allowed.")
            return
        await self.app(scope, receive, send)

    @staticmethod
    async def _reject(scope: Scope, send: Send, detail: str) -> None:
        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 1008})
            return
        body = json.dumps({"detail": detail}).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 403,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
            }
        )
        await send({"type": "http.response.body", "body": body})
