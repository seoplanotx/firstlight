from __future__ import annotations

import io
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app import serve


class ParentWatchTests(unittest.TestCase):
    def test_stdin_eof_stops_server_then_exits(self) -> None:
        server = SimpleNamespace(should_exit=False)
        with patch.object(serve.os, "_exit") as hard_exit, patch.object(serve.time, "sleep"):
            thread = serve.watch_parent_stdin(server, stream=io.BytesIO(b"ignored bytes"), grace_seconds=0)
            assert thread is not None
            thread.join(timeout=2)
        self.assertTrue(server.should_exit)
        hard_exit.assert_called_once_with(0)

    def test_no_stdin_means_no_watcher(self) -> None:
        with patch.object(serve.sys, "stdin", None):
            self.assertIsNone(serve.watch_parent_stdin(SimpleNamespace(should_exit=False)))


if __name__ == "__main__":
    unittest.main()
