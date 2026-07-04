from __future__ import annotations

import argparse

import uvicorn

from app.core.config import settings
# Import the ASGI app statically (not via uvicorn's "app.main:app" string) so
# PyInstaller traces the full application dependency graph into the frozen
# sidecar; a runtime string import can't resolve modules that were never
# bundled.
from app.main import app as fastapi_app


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the OncoWatch local backend.")
    parser.add_argument("--host", default=settings.backend_host)
    parser.add_argument("--port", type=int, default=settings.backend_port)
    args = parser.parse_args()

    uvicorn.run(fastapi_app, host=args.host, port=args.port, reload=False)


if __name__ == "__main__":
    main()
