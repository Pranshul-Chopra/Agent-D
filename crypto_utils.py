"""
crypto_utils.py — Cryptographic utilities for Agent-D.
Provides:
1. Machine-bound key derivation (PBKDF2-HMAC-SHA256).
2. Authenticated AES-256-GCM encryption & decryption for sensitive clinical fields and API keys.
3. Cryptographically secure launch token generation.
"""

import os
import base64
import secrets
from pathlib import Path
from typing import Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes


SALT_STATIC = b"agent_d_clinical_vault_salt_v1"


def get_master_key(custom_passphrase: Optional[str] = None) -> bytes:
    """
    Derives a stable, 256-bit AES key bound to the local machine and user profile.
    If a custom passphrase is supplied (or configured in app_settings), it is combined.
    """
    username = os.getenv("USERNAME") or os.getenv("USER") or "agent_d_physician"
    local_app_data = os.getenv("LOCALAPPDATA") or str(Path.home())
    machine_seed = f"agent_d_vault_seed:{username}:{local_app_data}".encode("utf-8")
    if custom_passphrase:
        machine_seed += f":{custom_passphrase}".encode("utf-8")

    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=SALT_STATIC,
        iterations=100_000,
    )
    return kdf.derive(machine_seed)


def encrypt_text(plaintext: str, custom_passphrase: Optional[str] = None) -> str:
    """Encrypts plaintext string using AES-256-GCM, returning a formatted base64 string."""
    if not plaintext:
        return ""
    key = get_master_key(custom_passphrase)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # Standard 96-bit nonce for AES-GCM
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    payload = nonce + ciphertext
    return "aes_gcm_v1:" + base64.urlsafe_b64encode(payload).decode("ascii")


def decrypt_text(ciphertext: str, custom_passphrase: Optional[str] = None) -> str:
    """Decrypts an AES-256-GCM formatted base64 payload back to plaintext."""
    if not ciphertext:
        return ""
    if not ciphertext.startswith("aes_gcm_v1:"):
        # Not encrypted with this cipher (e.g. legacy plain or unencrypted fallback)
        return ciphertext

    try:
        raw_b64 = ciphertext[len("aes_gcm_v1:"):]
        payload = base64.urlsafe_b64decode(raw_b64.encode("ascii"))
        if len(payload) < 28:  # 12-byte nonce + 16-byte tag minimum
            return ""

        nonce = payload[:12]
        ct = payload[12:]
        key = get_master_key(custom_passphrase)
        aesgcm = AESGCM(key)
        decrypted = aesgcm.decrypt(nonce, ct, None)
        return decrypted.decode("utf-8")
    except Exception as e:
        return ""


def generate_auth_token() -> str:
    """Generates a 32-byte (64-char hex) cryptographically random bearer token."""
    return secrets.token_hex(32)
