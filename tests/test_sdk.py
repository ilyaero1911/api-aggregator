import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sdk" / "python"))

from neurogateway.client import Client


class SDKClientTest(unittest.TestCase):
    def test_payload_keeps_provider(self) -> None:
        client = Client("http://localhost:8080", "secret")
        body = client.chat_payload("gpt", [{"role": "user", "content": "a"}], provider={"only": ["mock"]})
        self.assertEqual(body["provider"]["only"], ["mock"])
        self.assertEqual(client.url("/v1/credits"), "http://localhost:8080/v1/credits")
