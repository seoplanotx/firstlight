from __future__ import annotations

import argparse
import logging
import os
import sys
import threading
import time

import uvicorn

from app.core.config import settings
# Import the ASGI app statically (not via uvicorn's "app.main:app" string) so
# PyInstaller traces the full application dependency graph into the frozen
# sidecar; a runtime string import can't resolve modules that were never
# bundled.
from app.main import app as fastapi_app

logger = logging.getLogger(__name__)

# How long a graceful shutdown may take after the parent goes away before the
# process exits hard, so a stuck request can never keep port 17845 occupied.
_PARENT_EXIT_GRACE_SECONDS = 5.0


def watch_parent_stdin(server: uvicorn.Server, stream=None, grace_seconds: float = _PARENT_EXIT_GRACE_SECONDS) -> threading.Thread | None:
    """Stop the server when the desktop shell that spawned us goes away.

    The Tauri shell holds the write end of our stdin pipe. When it quits,
    crashes, or is force-killed, the OS closes that pipe and reads hit EOF. That
    is the one signal that works on macOS and Windows alike — including the
    PyInstaller one-file layout, where killing the bootloader alone would leave
    the Python child orphaned and still bound to the port.
    """
    stream = stream if stream is not None else getattr(sys.stdin, "buffer", sys.stdin)
    if stream is None:
        return None

    def _watch() -> None:
        try:
            while stream.read(1024):
                pass
        except (OSError, ValueError):
            pass
        logger.info("Desktop shell closed the backend's stdin; shutting down.")
        server.should_exit = True
        time.sleep(grace_seconds)
        os._exit(0)

    thread = threading.Thread(target=_watch, name="parent-stdin-watch", daemon=True)
    thread.start()
    return thread


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Firstlight local backend.")
    parser.add_argument("--host", default=settings.backend_host)
    parser.add_argument("--port", type=int, default=settings.backend_port)
    parser.add_argument(
        "--exit-with-parent",
        action="store_true",
        help="Shut down when stdin closes (set by the desktop shell so the sidecar never outlives it).",
    )
    args = parser.parse_args()

    server = uvicorn.Server(uvicorn.Config(fastapi_app, host=args.host, port=args.port, reload=False))
    if args.exit_with_parent:
        watch_parent_stdin(server)
    server.run()


if __name__ == "__main__":
    main()
