# ── llm/gateway.py ────────────────────────────────────────────────────────────
# PM Tool — LLM Gateway
# Multi-provider AI dispatch: Ollama (local), Gemini, OpenAI-compatible APIs.
# Ported and stripped from PranshulOS ai_engine.py.

import os
import json
import base64
import hashlib
import hmac
import time
import requests
from pathlib import Path
from typing import Any, Dict, List, Optional


# ── Machine-bound Secret Encryption ───────────────────────────────────────────

def _get_machine_key() -> bytes:
    """Derive a stable, machine-specific key for local SQLite secret encryption."""
    user = os.getenv("USERNAME") or os.getenv("USER") or "pm_tool_user"
    local_app_data = os.getenv("LOCALAPPDATA") or str(Path.home())
    seed = f"pm_tool_ai_secret_seed:{user}:{local_app_data}".encode("utf-8")
    return hashlib.pbkdf2_hmac("sha256", seed, b"salt_pm_tool_v1_ai", 100000, dklen=32)


def encrypt_secret(plain_text: str) -> str:
    """Encrypt a secret string into an authenticated base64 payload."""
    if not plain_text:
        return ""
    key = _get_machine_key()
    raw = plain_text.encode("utf-8")

    keystream = bytearray()
    nonce = os.urandom(16)
    counter = 0
    while len(keystream) < len(raw):
        block = hashlib.sha256(key + nonce + counter.to_bytes(4, "big")).digest()
        keystream.extend(block)
        counter += 1

    cipher_bytes = bytes(a ^ b for a, b in zip(raw, keystream[: len(raw)]))
    tag = hmac.new(key, nonce + cipher_bytes, hashlib.sha256).digest()[:16]
    payload = nonce + tag + cipher_bytes
    return "enc_v1:" + base64.urlsafe_b64encode(payload).decode("ascii")


def decrypt_secret(cipher_text: str) -> str:
    """Decrypt an authenticated base64 payload back into a plain secret string."""
    if not cipher_text or not cipher_text.startswith("enc_v1:"):
        return cipher_text or ""
    try:
        key = _get_machine_key()
        payload = base64.urlsafe_b64decode(cipher_text[len("enc_v1:"):].encode("ascii"))
        if len(payload) < 32:
            return ""
        nonce = payload[:16]
        expected_tag = payload[16:32]
        cipher_bytes = payload[32:]

        computed_tag = hmac.new(key, nonce + cipher_bytes, hashlib.sha256).digest()[:16]
        if not hmac.compare_digest(expected_tag, computed_tag):
            return ""

        keystream = bytearray()
        counter = 0
        while len(keystream) < len(cipher_bytes):
            block = hashlib.sha256(key + nonce + counter.to_bytes(4, "big")).digest()
            keystream.extend(block)
            counter += 1

        plain_bytes = bytes(a ^ b for a, b in zip(cipher_bytes, keystream[: len(cipher_bytes)]))
        return plain_bytes.decode("utf-8")
    except Exception:
        return ""


# ── Ollama Local Detection ─────────────────────────────────────────────────────

OLLAMA_BASE_URL = "http://127.0.0.1:11434"

# Preferred model priority order when auto-selecting from available Ollama models
OLLAMA_PREFERRED = [
    "llama3.2:latest", "llama3.2",
    "llama3.1:latest", "llama3.1",
    "llama3:latest", "llama3",
    "mistral:latest", "mistral",
    "gemma2:latest", "gemma2",
    "gemma:latest", "gemma",
    "phi3:latest", "phi3",
    "phi4:latest", "phi4",
]


def detect_ollama(timeout: float = 1.5) -> Dict[str, Any]:
    """
    Check if Ollama is running on localhost:11434 and return available models.
    Returns available models sorted by preferred quality order.
    """
    try:
        res = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=timeout,
                           proxies={"http": None, "https": None})
        if res.status_code == 200:
            data = res.json()
            raw_models = data.get("models", [])
            model_names = [m.get("name", "") for m in raw_models if m.get("name")]

            # Select best default model from preferred list
            selected = next(
                (m for m in OLLAMA_PREFERRED if m in model_names),
                model_names[0] if model_names else None
            )

            return {
                "available": True,
                "models": model_names,
                "selected_model": selected,
                "warning": (
                    "Ollama is running but no models are installed. "
                    "Run `ollama pull llama3.2` to get started."
                ) if not model_names else None,
            }
    except Exception:
        pass

    return {
        "available": False,
        "models": [],
        "selected_model": None,
        "warning": None,
    }


# ── Gemini Model Discovery ─────────────────────────────────────────────────────

def get_available_gemini_models(api_key: str) -> List[str]:
    """
    Query Google AI Studio ModelService to discover active text chat models,
    sorted by cost-to-quality ratio (Flash-Lite → Flash → Pro).
    """
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
        res = requests.get(url, timeout=8.0)
        if res.status_code == 200:
            data = res.json()
            models = []
            for item in data.get("models", []):
                methods = item.get("supportedGenerationMethods", [])
                if "generateContent" not in methods:
                    continue
                name = item.get("name", "")
                if name.startswith("models/"):
                    name = name[7:]
                low = name.lower()
                # Filter non-text modalities
                if any(bad in low for bad in ("tts", "audio", "embed", "imagen", "aqa", "image")):
                    continue
                models.append(name)

            def _sort_key(m: str) -> int:
                low = m.lower()
                if "flash-lite" in low and "exp" not in low and "preview" not in low:
                    return 0
                if "flash-lite" in low:
                    return 1
                if "flash" in low and "exp" not in low and "preview" not in low:
                    return 2
                if "flash" in low:
                    return 3
                if "pro" in low and "exp" not in low:
                    return 4
                return 5

            models.sort(key=_sort_key)
            return models
    except Exception:
        pass
    return []


# ── Provider Status & Config ───────────────────────────────────────────────────

DEFAULT_TOKEN_LIMITS = {
    "chat_max_tokens": 8192,
    "file_gen_max_tokens": 16384,
    "plan_max_tokens": 8192,
    "tool_call_max_tokens": 16384,
}


def get_configured_token_limits(db_module) -> Dict[str, int]:
    """Retrieve user-configured token headroom from ai_config table."""
    limits = {}
    for key, default_val in DEFAULT_TOKEN_LIMITS.items():
        try:
            raw = db_module.get_ai_config(key)
            if raw is not None and str(raw).strip():
                val = int(str(raw).strip())
                limits[key] = max(256, min(131072, val))
                continue
        except Exception:
            pass
        limits[key] = default_val
    return limits


def get_llm_status(db_module) -> Dict[str, Any]:
    """
    Determine the active LLM provider and return full status.
    Uses ai_config table via db_module for stored preferences.
    """
    ollama_info = detect_ollama()

    saved_provider = db_module.get_ai_config("provider") or "auto"
    saved_model = db_module.get_ai_config("model_name")
    raw_api_key = db_module.get_ai_config("api_key")
    api_key = decrypt_secret(raw_api_key) if raw_api_key else ""
    api_base = db_module.get_ai_config("api_base") or ""

    has_api_key = bool(api_key and len(api_key.strip()) >= 8)

    active_provider = "none"
    active_model = None

    if saved_provider == "ollama" and ollama_info["available"] and ollama_info["models"]:
        active_provider = "ollama"
        active_model = (
            saved_model if saved_model in ollama_info["models"]
            else ollama_info["selected_model"]
        )
    elif saved_provider == "api" and has_api_key:
        active_provider = "api"
        active_model = saved_model or "gemini-flash-lite-latest"
    elif saved_provider == "auto":
        if ollama_info["available"] and ollama_info["models"]:
            active_provider = "ollama"
            active_model = ollama_info["selected_model"]
        elif has_api_key:
            active_provider = "api"
            active_model = saved_model or "gemini-flash-lite-latest"

    # Mask key for display: show prefix only
    key_display = ""
    if api_key:
        key_display = api_key[:8] + "..." + api_key[-4:] if len(api_key) > 12 else "****"

    return {
        "active_provider": active_provider,
        "active_model": active_model,
        "ollama": ollama_info,
        "api_configured": has_api_key,
        "api_key_display": key_display,
        "api_base": api_base or "(using Gemini native)",
        "saved_provider_pref": saved_provider,
        "saved_model": saved_model,
        "setup_required": (active_provider == "none"),
        "token_limits": get_configured_token_limits(db_module),
    }


def save_llm_config(
    db_module,
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
    api_base: Optional[str] = None,
    model_name: Optional[str] = None,
    chat_max_tokens: Optional[int] = None,
    file_gen_max_tokens: Optional[int] = None,
    plan_max_tokens: Optional[int] = None,
    tool_call_max_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    """Save LLM provider preferences with encrypted API key and token limits to ai_config table."""
    if provider:
        db_module.set_ai_config("provider", provider.strip().lower())
    if api_key is not None:
        if api_key.strip():
            db_module.set_ai_config("api_key", encrypt_secret(api_key.strip()))
        else:
            db_module.delete_ai_config("api_key")
    if api_base is not None:
        db_module.set_ai_config("api_base", api_base.strip())
    if model_name is not None:
        db_module.set_ai_config("model_name", model_name.strip())

    for key, val in (
        ("chat_max_tokens", chat_max_tokens),
        ("file_gen_max_tokens", file_gen_max_tokens),
        ("plan_max_tokens", plan_max_tokens),
        ("tool_call_max_tokens", tool_call_max_tokens),
    ):
        if val is not None:
            try:
                clamped_val = max(256, min(131072, int(val)))
                db_module.set_ai_config(key, str(clamped_val))
            except (ValueError, TypeError):
                pass

    return get_llm_status(db_module)


# ── Gemini Native Dispatch ─────────────────────────────────────────────────────

def _dispatch_gemini(
    api_key: str,
    model_name: str,
    system_prompt: str,
    history: List[Dict],
    message: str,
    max_tokens: int = 8192,
    temperature: float = 0.7,
) -> Dict[str, Any]:
    """Direct Google Gemini REST API caller with model fallback chain."""
    raw_model = (model_name or "").strip().lstrip("models/")

    candidate_models = []
    if raw_model and not any(bad in raw_model.lower() for bad in ("tts", "audio", "embed", "imagen", "image")):
        candidate_models.append(raw_model)

    for fallback in (
        "gemini-flash-lite-latest",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-flash-latest",
        "gemini-1.5-flash",
    ):
        if fallback not in candidate_models:
            candidate_models.append(fallback)

    # Build contents for Gemini (alternating user/model turns)
    contents = []
    for h in history:
        role = "user" if h.get("role") == "user" else "model"
        text = str(h.get("content", "")).strip()
        if text:
            if contents and contents[-1]["role"] == role:
                contents[-1]["parts"].append({"text": text})
            else:
                contents.append({"role": role, "parts": [{"text": text}]})

    if contents and contents[-1]["role"] == "user":
        contents[-1]["parts"].append({"text": message})
    else:
        contents.append({"role": "user", "parts": [{"text": message}]})

    # Native Gemini REST API imposes an 8192 token output limit
    gemini_max_tokens = min(max(1, max_tokens), 8192)
    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": contents,
        "generationConfig": {"temperature": temperature, "maxOutputTokens": gemini_max_tokens},
    }
    headers = {"Content-Type": "application/json"}

    last_err = ""
    had_rate_limit = False
    attempted = 0

    for model in candidate_models[:6]:
        attempted += 1
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        try:
            res = requests.post(url, json=payload, headers=headers, timeout=60.0)
            if res.status_code == 200:
                data = res.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        return {
                            "response": parts[0].get("text", ""),
                            "provider": "gemini",
                            "model": model,
                        }
                return {"error": "Gemini returned an empty response. Please try rephrasing your request."}
            elif res.status_code == 404:
                last_err = res.json().get("error", {}).get("message", res.text[:200])
                if attempted == 1:
                    discovered = get_available_gemini_models(api_key)
                    for disc in discovered:
                        if disc not in candidate_models:
                            candidate_models.append(disc)
                time.sleep(0.3)
                continue
            elif res.status_code in (429, 503):
                had_rate_limit = True
                last_err = res.json().get("error", {}).get("message", res.text[:200])
                time.sleep(0.8)
                continue
            elif res.status_code in (401, 403):
                return {
                    "error": "Invalid or unauthorized Gemini API Key. "
                             "Please check your key at https://aistudio.google.com/app/apikey and update it in Settings."
                }
            else:
                last_err = f"HTTP {res.status_code}: {res.text[:200]}"
                continue
        except requests.exceptions.Timeout:
            last_err = f"Model '{model}' timed out after 60s."
            time.sleep(0.4)
            continue
        except requests.exceptions.ConnectionError:
            return {"error": "Network connection unavailable. PM Tool is operating in offline mode.", "offline": True}
        except Exception as e:
            err_str = str(e)
            if "connection" in err_str.lower() or "getaddrinfo" in err_str.lower():
                return {"error": "Network connection unavailable. PM Tool is operating in offline mode.", "offline": True}
            last_err = err_str
            continue

    if had_rate_limit:
        return {
            "error": "The AI model service is currently experiencing high demand or rate limits. "
                     "Please try again in a few moments, or select a local Ollama model in Settings."
        }

    return {
        "error": f"Unable to reach an active Gemini model at this time ({last_err}). "
                 "Please verify your API key or model selection in Settings."
    }


# ── Main Gateway Dispatch ──────────────────────────────────────────────────────

def call_llm(
    db_module,
    system_prompt: str,
    message: str,
    history: Optional[List[Dict]] = None,
    max_tokens: int = 8192,
    temperature: float = 0.7,
    **kwargs,
) -> Dict[str, Any]:
    """
    Unified LLM call. Auto-routes to the active provider:
      - ollama   → local Ollama REST API
      - api      → Gemini (native) or any OpenAI-compatible endpoint (Groq, OpenAI, etc.)
      - none     → returns setup_required error

    Args:
        db_module:     The db module (or ai_db module) with get_ai_config/set_ai_config.
        system_prompt: The system instruction string.
        message:       The current user message (latest turn).
        history:       List of {"role": "user"|"assistant", "content": str} prior turns.
        max_tokens:    Maximum generation output token budget (defaults to 8192).
        temperature:   Sampling temperature for response diversity (defaults to 0.7).

    Returns:
        Dict with keys: response, provider, model  — or error, offline, setup_required.
    """
    history = history or []
    status = get_llm_status(db_module)

    if status["setup_required"]:
        return {
            "error": "No AI provider is configured. Set up Ollama or add an API key in Settings.",
            "setup_required": True,
            "ollama_available": status["ollama"]["available"],
            "ollama_models": status["ollama"]["models"],
        }

    # Cap history at last 20 turns
    clean_history = []
    for h in history[-20:]:
        role = h.get("role", "user")
        content = h.get("content", "")
        if role in ("user", "assistant") and content:
            clean_history.append({"role": role, "content": str(content)[:4000]})

    provider = status["active_provider"]
    model_name = status["active_model"] or ""

    effective_max_tokens = max_tokens if (max_tokens and max_tokens > 0) else status.get("token_limits", {}).get("chat_max_tokens", 8192)

    # ── Ollama ──────────────────────────────────────────────────────────────────
    if provider == "ollama":
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(clean_history)
        messages.append({"role": "user", "content": message.strip()[:4000]})
        try:
            payload = {
                "model": model_name,
                "messages": messages,
                "stream": False,
                "keep_alive": "30m",
                "options": {"temperature": temperature, "num_ctx": max(16384, effective_max_tokens * 2), "num_predict": effective_max_tokens},
            }
            res = requests.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload,
                                timeout=120.0, proxies={"http": None, "https": None})
            if res.status_code == 200:
                data = res.json()
                return {
                    "response": data.get("message", {}).get("content", ""),
                    "provider": "ollama",
                    "model": model_name,
                }
            return {"error": f"Ollama error (HTTP {res.status_code}): {res.text[:200]}"}
        except requests.exceptions.Timeout:
            return {"error": "Ollama response timed out (120s). The model may still be loading into memory."}
        except Exception as e:
            return {"error": f"Failed to communicate with Ollama: {str(e)}"}

    # ── Cloud API ───────────────────────────────────────────────────────────────
    elif provider == "api":
        raw_key = db_module.get_ai_config("api_key")
        api_key = decrypt_secret(raw_key) if raw_key else ""
        api_base = db_module.get_ai_config("api_base") or ""

        if not api_key:
            return {"error": "API key is missing or failed decryption.", "setup_required": True}

        # Route: Gemini native vs OpenAI-compatible
        is_gemini = (
            api_key.startswith("AIzaSy")
            or "googleapis.com" in api_base.lower()
            or "gemini" in model_name.lower()
            or not api_base  # Default to Gemini if no base configured
        )

        if is_gemini:
            return _dispatch_gemini(
                api_key=api_key,
                model_name=model_name or "gemini-flash-lite-latest",
                system_prompt=system_prompt,
                history=clean_history,
                message=message.strip()[:4000],
                max_tokens=effective_max_tokens,
                temperature=temperature,
            )

        # OpenAI-compatible endpoint (OpenAI, Groq, DeepSeek, Mistral, OpenRouter, LM Studio)
        base_clean = api_base.rstrip("/")
        endpoint = base_clean if base_clean.endswith("/chat/completions") else base_clean + "/chat/completions"

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(clean_history)
        messages.append({"role": "user", "content": message.strip()[:4000]})

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://pm-tool.app",
            "X-Title": "PM Tool",
        }
        payload = {
            "model": model_name or "gpt-4o-mini",
            "messages": messages,
            "temperature": temperature,
            "max_tokens": effective_max_tokens,
        }
        try:
            res = requests.post(endpoint, json=payload, headers=headers, timeout=60.0)
            if res.status_code == 200:
                data = res.json()
                choices = data.get("choices", [])
                if choices:
                    return {
                        "response": choices[0].get("message", {}).get("content", ""),
                        "provider": "api",
                        "model": model_name or "gpt-4o-mini",
                    }
                return {"error": "Received empty response choices from Cloud API."}
            elif res.status_code == 401:
                return {"error": "Invalid API key (401 Unauthorized). Check your key in Settings."}
            elif res.status_code == 429:
                return {"error": "Rate limit exceeded or insufficient API quota (429)."}
            else:
                return {"error": f"API Provider Error (HTTP {res.status_code}): {res.text[:200]}"}
        except requests.exceptions.ConnectionError:
            return {"error": "Network connection unavailable. PM Tool is in offline mode.", "offline": True}
        except requests.exceptions.Timeout:
            return {"error": "Cloud API request timed out (60s). Please retry."}
        except Exception as e:
            err_str = str(e)
            if "connection" in err_str.lower() or "getaddrinfo" in err_str.lower():
                return {"error": "Network connection unavailable. PM Tool is in offline mode.", "offline": True}
            return {"error": f"Failed to connect to Cloud API: {err_str}"}

    return {"error": "Unknown or unsupported provider configuration."}
