"""
llm_provider.py — Sovereign Local LLM Provider Interface for Agent-D.
Implements:
1. Abstract base provider interface (BaseLLMProvider) allowing pluggable backends.
2. Hardened local Ollama provider (OllamaProvider) locked strictly to loopback (127.0.0.1:11434).
3. Request timeouts, error classification, and graceful streaming failover.
4. Provider registry with Ollama as the active local implementation.
"""

import json
import logging
import requests
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Generator

logger = logging.getLogger("agentd.llm_provider")

# ── Errors ────────────────────────────────────────────────────────────────────

class LLMProviderError(Exception):
    """Base exception for LLM provider errors."""
    pass


class OllamaUnavailableError(LLMProviderError):
    """Raised when local Ollama service is not running or unreachable on 127.0.0.1:11434."""
    pass


class OllamaModelNotFoundError(LLMProviderError):
    """Raised when the requested model is not installed in local Ollama."""
    pass


# ── Provider Interface ────────────────────────────────────────────────────────

class BaseLLMProvider(ABC):
    """Abstract interface for LLM inference providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier (e.g. 'ollama')."""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Checks if the provider service is active and responsive."""
        pass

    @abstractmethod
    def get_available_models(self) -> List[str]:
        """Lists installed/available model identifiers."""
        pass

    @abstractmethod
    def chat_stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.3,
        timeout: float = 90.0,
    ) -> Generator[str, None, None]:
        """
        Streams response tokens from the provider.
        Yields text token chunks.
        """
        pass

    @abstractmethod
    def chat_sync(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.3,
        timeout: float = 90.0,
    ) -> Dict[str, Any]:
        """Synchronous chat completion."""
        pass


# ── Concrete Ollama Provider (Hardened Loopback) ──────────────────────────────

class OllamaProvider(BaseLLMProvider):
    """
    Hardened Local Ollama Provider.
    Enforces loopback address only (127.0.0.1:11434) to eliminate network egress.
    """

    DEFAULT_HOST = "http://127.0.0.1:11434"
    PREFERRED_MODELS = [
        "llama3.2:latest", "llama3.2",
        "llama3.1:8b", "llama3.1:latest", "llama3.1",
        "qwen2.5:7b", "qwen2.5:latest", "qwen2.5",
        "mistral:latest", "mistral",
        "meditron:latest", "meditron",
        "phi3:latest", "phi3",
        "gemma2:latest", "gemma2",
    ]

    def __init__(self, host: str = DEFAULT_HOST):
        # HARDENED SECURITY: Force strictly loopback IP to prevent remote network egress
        if "127.0.0.1" not in host and "localhost" not in host:
            logger.warning("Non-loopback Ollama host rejected for security. Reverting to 127.0.0.1:11434")
            self._host = self.DEFAULT_HOST
        else:
            self._host = host.rstrip("/")

    @property
    def name(self) -> str:
        return "ollama"

    @property
    def host(self) -> str:
        return self._host

    def is_available(self, timeout: float = 1.5) -> bool:
        """Probes local Ollama /api/tags endpoint with short timeout."""
        try:
            res = requests.get(
                f"{self._host}/api/tags",
                timeout=timeout,
                proxies={"http": None, "https": None},
            )
            return res.status_code == 200
        except Exception:
            return False

    def get_available_models(self, timeout: float = 2.0) -> List[str]:
        """Fetches list of installed Ollama models."""
        try:
            res = requests.get(
                f"{self._host}/api/tags",
                timeout=timeout,
                proxies={"http": None, "https": None},
            )
            if res.status_code == 200:
                data = res.json()
                raw = data.get("models", [])
                return [m.get("name", "") for m in raw if m.get("name")]
        except Exception as e:
            logger.debug(f"Failed to query Ollama models: {e}")
        return []

    def select_default_model(self) -> Optional[str]:
        """Picks best installed model from preference priority."""
        models = self.get_available_models()
        if not models:
            return None
        for pref in self.PREFERRED_MODELS:
            if pref in models:
                return pref
        return models[0]

    def chat_stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.3,
        timeout: float = 90.0,
    ) -> Generator[str, None, None]:
        """
        Streams token chunks from local Ollama via /api/chat.
        Fails gracefully by raising OllamaUnavailableError or OllamaModelNotFoundError.
        """
        installed = self.get_available_models()
        if not installed:
            raise OllamaUnavailableError("Ollama is not running on 127.0.0.1:11434 or has no models installed.")

        target_model = model or self.select_default_model()
        if not target_model:
            raise OllamaModelNotFoundError("No Ollama model specified or found.")

        payload = {
            "model": target_model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": temperature,
            },
        }

        url = f"{self._host}/api/chat"
        try:
            res = requests.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
                stream=True,
                timeout=timeout,
                proxies={"http": None, "https": None},
            )
        except requests.exceptions.ConnectionError as ce:
            raise OllamaUnavailableError(f"Cannot connect to Ollama on {self._host}: {ce}")
        except requests.exceptions.Timeout as te:
            raise OllamaUnavailableError(f"Ollama connection timed out: {te}")
        except Exception as e:
            raise LLMProviderError(f"Ollama request error: {e}")

        if res.status_code == 404:
            raise OllamaModelNotFoundError(f"Model '{target_model}' not found in local Ollama.")
        elif res.status_code != 200:
            raise LLMProviderError(f"Ollama returned HTTP {res.status_code}: {res.text[:200]}")

        try:
            for raw_line in res.iter_lines(decode_unicode=True):
                if not raw_line:
                    continue
                line = raw_line.strip()
                try:
                    chunk = json.loads(line)
                    msg = chunk.get("message", {})
                    token = msg.get("content", "")
                    if token:
                        yield token
                    if chunk.get("done", False):
                        break
                except json.JSONDecodeError:
                    continue
        except Exception as e:
            logger.error(f"Error during Ollama stream iteration: {e}")
            raise LLMProviderError(f"Ollama stream interrupted: {e}")

    def chat_sync(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.3,
        timeout: float = 90.0,
    ) -> Dict[str, Any]:
        """Synchronous completion aggregating streamed tokens."""
        full_text = ""
        target_model = model or self.select_default_model() or "ollama-local"
        for tok in self.chat_stream(messages, model=target_model, temperature=temperature, timeout=timeout):
            full_text += tok
        return {
            "response": full_text,
            "provider": self.name,
            "model": target_model,
        }


# ── Global Registry ───────────────────────────────────────────────────────────

_DEFAULT_PROVIDER = OllamaProvider()


def get_llm_provider() -> BaseLLMProvider:
    """Returns active local LLM provider (Ollama)."""
    return _DEFAULT_PROVIDER


def get_provider_status() -> Dict[str, Any]:
    """Returns local AI status for frontend display."""
    provider = get_llm_provider()
    available = provider.is_available()
    models = provider.get_available_models() if available else []
    selected = None
    if isinstance(provider, OllamaProvider) and available:
        selected = provider.select_default_model()

    warning = None
    if not available:
        warning = "Ollama is not running on 127.0.0.1:11434. Operating in Local Rule-Based Synthesis mode."
    elif not models:
        warning = "Ollama is active but has no installed models. Run `ollama run llama3.2` to download a model."

    return {
        "provider": "ollama",
        "active_provider": "ollama" if (available and models) else "offline_synthesis",
        "available": available,
        "models": models,
        "selected_model": selected,
        "host": "http://127.0.0.1:11434",
        "warning": warning,
        "is_local_only": True,
        "zero_cloud_egress": True,
    }
