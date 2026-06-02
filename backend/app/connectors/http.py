from __future__ import annotations

import logging
import time
from collections.abc import Callable
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Transient HTTP statuses that are worth retrying. Anything else (e.g. 400, 404)
# is a deterministic failure and is returned to the caller immediately.
RETRYABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 504})


def get_with_retries(
    client: httpx.Client,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    max_attempts: int = 3,
    backoff_base: float = 0.5,
    sleep: Callable[[float], None] = time.sleep,
) -> httpx.Response:
    """Issue a GET request, retrying transient network and server errors.

    Retries on connection/timeout errors (``httpx.TransportError``) and on
    retryable HTTP status codes (429 and 5xx) using exponential backoff. The
    response is returned without calling ``raise_for_status`` so the caller's
    existing error handling stays in charge: a non-retryable error response is
    returned as-is, and a transport error on the final attempt is re-raised so
    the connector's per-source error handling in ``monitoring_service`` records
    it. This keeps one flaky source from failing an entire monitoring run.
    """
    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        is_last = attempt == max_attempts
        try:
            response = client.get(url, params=params)
        except httpx.TransportError as exc:
            last_error = exc
            logger.warning(
                "GET %s failed (attempt %d/%d): %s", url, attempt, max_attempts, exc
            )
            if is_last:
                raise
        else:
            if response.status_code in RETRYABLE_STATUS_CODES and not is_last:
                logger.warning(
                    "GET %s returned %d (attempt %d/%d); retrying",
                    url,
                    response.status_code,
                    attempt,
                    max_attempts,
                )
            else:
                return response
        sleep(backoff_base * (2 ** (attempt - 1)))

    # The loop always returns or raises within max_attempts; this is a safety net.
    raise last_error  # type: ignore[misc]  # pragma: no cover
