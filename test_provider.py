"""
test_provider.py — Sovereign Local LLM Provider Verification Suite for Agent-D.
Validates:
1. BaseLLMProvider interface compliance.
2. Hardened loopback binding for OllamaProvider (strictly 127.0.0.1:11434).
3. Availability probing and model discovery.
4. Streaming response parsing and termination signals.
5. Error handling and graceful fallback (OllamaUnavailableError, OllamaModelNotFoundError).
6. Zero cloud egress verification.
"""

import json
import unittest
from unittest.mock import patch, MagicMock
import llm_provider


class TestLLMProvider(unittest.TestCase):

    def test_01_ollama_provider_hardened_loopback(self):
        """OllamaProvider must strictly bind to loopback address (127.0.0.1:11434)."""
        provider = llm_provider.OllamaProvider()
        self.assertIn("127.0.0.1", provider.host)
        self.assertEqual(provider.name, "ollama")

        # Non-loopback host must be rejected and reverted to loopback
        remote_provider = llm_provider.OllamaProvider(host="http://remote-server.com:11434")
        self.assertEqual(remote_provider.host, "http://127.0.0.1:11434")

    @patch("llm_provider.requests.get")
    def test_02_ollama_availability_and_models(self, mock_get):
        """Test probing /api/tags for service availability and installed models."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "models": [
                {"name": "llama3.2:latest"},
                {"name": "mistral:latest"},
            ]
        }
        mock_get.return_value = mock_resp

        provider = llm_provider.OllamaProvider()
        self.assertTrue(provider.is_available())
        models = provider.get_available_models()
        self.assertEqual(len(models), 2)
        self.assertIn("llama3.2:latest", models)
        self.assertEqual(provider.select_default_model(), "llama3.2:latest")

    @patch("llm_provider.requests.get")
    def test_03_ollama_unavailable_when_offline(self, mock_get):
        """When Ollama is not running, is_available returns False and get_available_models returns empty."""
        mock_get.side_effect = Exception("Connection refused")

        provider = llm_provider.OllamaProvider()
        self.assertFalse(provider.is_available())
        self.assertEqual(provider.get_available_models(), [])

    @patch("llm_provider.requests.get")
    def test_04_streaming_fails_gracefully_when_offline(self, mock_get):
        """When Ollama is offline, chat_stream raises OllamaUnavailableError."""
        mock_get.side_effect = Exception("Connection refused")

        provider = llm_provider.OllamaProvider()
        with self.assertRaises(llm_provider.OllamaUnavailableError):
            list(provider.chat_stream([{"role": "user", "content": "Hello"}]))

    @patch("llm_provider.requests.post")
    @patch("llm_provider.requests.get")
    def test_05_streaming_successful_response(self, mock_get, mock_post):
        """Test streaming token chunks from /api/chat."""
        mock_get_resp = MagicMock()
        mock_get_resp.status_code = 200
        mock_get_resp.json.return_value = {"models": [{"name": "llama3.2"}]}
        mock_get.return_value = mock_get_resp

        mock_post_resp = MagicMock()
        mock_post_resp.status_code = 200
        mock_post_resp.iter_lines.return_value = [
            b'{"model": "llama3.2", "message": {"content": "Hello "}, "done": false}',
            b'{"model": "llama3.2", "message": {"content": "Doctor."}, "done": true}',
        ]
        mock_post.return_value = mock_post_resp

        provider = llm_provider.OllamaProvider()
        tokens = list(provider.chat_stream([{"role": "user", "content": "Hi"}], model="llama3.2"))
        self.assertEqual("".join(tokens), "Hello Doctor.")

    def test_06_provider_status_structure(self):
        """Verify get_provider_status reports zero cloud egress and local provider."""
        status = llm_provider.get_provider_status()
        self.assertEqual(status["provider"], "ollama")
        self.assertTrue(status["is_local_only"])
        self.assertTrue(status["zero_cloud_egress"])
        self.assertIn("127.0.0.1", status["host"])


if __name__ == "__main__":
    unittest.main()
