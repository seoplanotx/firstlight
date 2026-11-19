from __future__ import annotations

import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.request_guard import LocalRequestGuardMiddleware, is_allowed_host, is_allowed_origin


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(LocalRequestGuardMiddleware)

    @app.post("/api/data/delete")
    def delete() -> dict[str, bool]:
        return {"deleted": True}

    return app


class RequestGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(_app(), base_url="http://127.0.0.1:17845")

    def test_allows_desktop_and_originless_requests(self) -> None:
        for origin in ("tauri://localhost", "http://tauri.localhost", "http://localhost:1420"):
            response = self.client.post("/api/data/delete", headers={"Origin": origin})
            self.assertEqual(response.status_code, 200, origin)
        self.assertEqual(self.client.post("/api/data/delete").status_code, 200)

    def test_rejects_cross_site_origin(self) -> None:
        response = self.client.post("/api/data/delete", headers={"Origin": "https://evil.example"})
        self.assertEqual(response.status_code, 403)
        self.assertIn("other websites", response.json()["detail"])

    def test_rejects_dns_rebinding_host(self) -> None:
        response = self.client.post("/api/data/delete", headers={"Host": "attacker.example:17845"})
        self.assertEqual(response.status_code, 403)

    def test_host_parsing(self) -> None:
        self.assertTrue(is_allowed_host("127.0.0.1:17845"))
        self.assertTrue(is_allowed_host("localhost"))
        self.assertTrue(is_allowed_host("[::1]:17845"))
        self.assertFalse(is_allowed_host("127.0.0.1.evil.example"))
        self.assertFalse(is_allowed_host(None))
        self.assertTrue(is_allowed_origin(None))
        self.assertFalse(is_allowed_origin("null"))


if __name__ == "__main__":
    unittest.main()
