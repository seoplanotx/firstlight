from __future__ import annotations

import unittest

import httpx

from app.connectors.http import get_with_retries


class GetWithRetriesTests(unittest.TestCase):
    def _client(self, handler) -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(handler))

    def test_returns_immediately_on_success(self) -> None:
        calls = {"count": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            calls["count"] += 1
            return httpx.Response(200, json={"ok": True})

        sleeps: list[float] = []
        with self._client(handler) as client:
            response = get_with_retries(client, "https://example.test/data", sleep=sleeps.append)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(calls["count"], 1)
        self.assertEqual(sleeps, [])

    def test_retries_transport_error_then_succeeds(self) -> None:
        calls = {"count": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            calls["count"] += 1
            if calls["count"] == 1:
                raise httpx.ConnectError("connection reset", request=request)
            return httpx.Response(200, json={"ok": True})

        sleeps: list[float] = []
        with self._client(handler) as client:
            response = get_with_retries(client, "https://example.test/data", sleep=sleeps.append)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(calls["count"], 2)
        self.assertEqual(len(sleeps), 1)

    def test_retries_retryable_status_then_succeeds(self) -> None:
        calls = {"count": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            calls["count"] += 1
            if calls["count"] < 3:
                return httpx.Response(503, text="busy")
            return httpx.Response(200, json={"ok": True})

        sleeps: list[float] = []
        with self._client(handler) as client:
            response = get_with_retries(client, "https://example.test/data", sleep=sleeps.append)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(calls["count"], 3)
        # Exponential backoff between the two retries.
        self.assertEqual(sleeps, [0.5, 1.0])

    def test_non_retryable_status_returns_without_retry(self) -> None:
        calls = {"count": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            calls["count"] += 1
            return httpx.Response(404, text="missing")

        sleeps: list[float] = []
        with self._client(handler) as client:
            response = get_with_retries(client, "https://example.test/data", sleep=sleeps.append)

        self.assertEqual(response.status_code, 404)
        self.assertEqual(calls["count"], 1)
        self.assertEqual(sleeps, [])

    def test_raises_after_exhausting_attempts(self) -> None:
        calls = {"count": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            calls["count"] += 1
            raise httpx.ConnectTimeout("timed out", request=request)

        sleeps: list[float] = []
        with self._client(handler) as client:
            with self.assertRaises(httpx.ConnectTimeout):
                get_with_retries(client, "https://example.test/data", sleep=sleeps.append)

        self.assertEqual(calls["count"], 3)
        # Sleeps only happen between attempts, not after the final failure.
        self.assertEqual(len(sleeps), 2)

    def test_returns_last_retryable_response_when_attempts_exhausted(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(503, text="still busy")

        sleeps: list[float] = []
        with self._client(handler) as client:
            response = get_with_retries(
                client, "https://example.test/data", max_attempts=2, sleep=sleeps.append
            )

        # The final retryable response is returned so the connector's own
        # raise_for_status() drives the error into per-source handling.
        self.assertEqual(response.status_code, 503)
        self.assertEqual(len(sleeps), 1)


if __name__ == "__main__":
    unittest.main()
