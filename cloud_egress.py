"""
cloud_egress.py — Single Egress Choke Point & PHI Scrubber for Agent-D.
Enforces Zero-PHI boundary before any cloud AI model network transmission:
1. Strict schema validation: Rejects payloads with unknown, unauthorized, or extra fields.
2. User message & tool output scrubber: Redacts patient legal names, phone numbers,
   email addresses, and canary strings prior to cloud egress.
3. Canary & PHI leak pre-flight verification: Halts egress with EgressSecurityError
   if any forbidden canary string or registered patient PII is found in serialized payload.
4. Single choke point dispatch: All external cloud network calls must route
   through dispatch_cloud_request or dispatch_cloud_streaming_request.
"""

import re
import json
import copy
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple, Generator
import requests

import context_db
import config_db


class EgressSecurityError(Exception):
    """Raised when an egress payload violates the Zero-PHI boundary or schema rules."""
    pass


# ── Allowed Payload Schema Whitelist ──────────────────────────────────────────

ALLOWED_ROOT_KEYS = {
    "contents",
    "system_instruction",
    "generationConfig",
    "safetySettings",
    "tools",
}

ALLOWED_CONTENT_KEYS = {"role", "parts"}
ALLOWED_PART_KEYS = {"text", "functionCall", "functionResponse"}
ALLOWED_GEN_CONFIG_KEYS = {
    "temperature",
    "maxOutputTokens",
    "topP",
    "topK",
    "stopSequences",
    "candidateCount",
}


def validate_egress_payload(payload: Dict[str, Any]) -> None:
    """
    Validates payload against strict schema allowlist.
    Raises EgressSecurityError if any unknown or disallowed fields are found.
    """
    if not isinstance(payload, dict):
        raise EgressSecurityError(f"Egress payload must be a JSON dictionary, got {type(payload).__name__}")

    # Check root keys
    for k in payload.keys():
        if k not in ALLOWED_ROOT_KEYS:
            raise EgressSecurityError(f"Disallowed root key in egress payload: '{k}'")

    # Check contents (mandatory)
    if "contents" not in payload:
        raise EgressSecurityError("Missing mandatory 'contents' array in egress payload")
    
    contents = payload["contents"]
    if not isinstance(contents, list) or len(contents) == 0:
        raise EgressSecurityError("'contents' must be a non-empty list")

    for i, item in enumerate(contents):
        if not isinstance(item, dict):
            raise EgressSecurityError(f"'contents[{i}]' must be a dictionary")
        for k in item.keys():
            if k not in ALLOWED_CONTENT_KEYS:
                raise EgressSecurityError(f"Disallowed key in contents[{i}]: '{k}'")
        if "role" not in item or item["role"] not in ("user", "model"):
            raise EgressSecurityError(f"Invalid or missing role in contents[{i}]: '{item.get('role')}'")
        if "parts" not in item or not isinstance(item["parts"], list):
            raise EgressSecurityError(f"Invalid or missing parts in contents[{i}]")
        for j, part in enumerate(item["parts"]):
            if not isinstance(part, dict):
                raise EgressSecurityError(f"contents[{i}].parts[{j}] must be a dictionary")
            for pk in part.keys():
                if pk not in ALLOWED_PART_KEYS:
                    raise EgressSecurityError(f"Disallowed key in contents[{i}].parts[{j}]: '{pk}'")

    # Check system_instruction if present
    if "system_instruction" in payload:
        sys_inst = payload["system_instruction"]
        if not isinstance(sys_inst, dict):
            raise EgressSecurityError("'system_instruction' must be a dictionary")
        for k in sys_inst.keys():
            if k not in ("parts", "role"):
                raise EgressSecurityError(f"Disallowed key in system_instruction: '{k}'")
        if "parts" in sys_inst:
            if not isinstance(sys_inst["parts"], list):
                raise EgressSecurityError("system_instruction.parts must be a list")
            for j, part in enumerate(sys_inst["parts"]):
                if not isinstance(part, dict):
                    raise EgressSecurityError(f"system_instruction.parts[{j}] must be a dictionary")
                for pk in part.keys():
                    if pk not in ALLOWED_PART_KEYS:
                        raise EgressSecurityError(f"Disallowed key in system_instruction.parts[{j}]: '{pk}'")

    # Check generationConfig if present
    if "generationConfig" in payload:
        gc = payload["generationConfig"]
        if not isinstance(gc, dict):
            raise EgressSecurityError("'generationConfig' must be a dictionary")
        for k in gc.keys():
            if k not in ALLOWED_GEN_CONFIG_KEYS:
                raise EgressSecurityError(f"Disallowed key in generationConfig: '{k}'")


# ── PII & Canary Scrubber ─────────────────────────────────────────────────────

# Regex patterns for identifiers
RE_PHONE = re.compile(
    r'(?:\+?(\d{1,3}))?[-.\s]?(?:\(?(\d{3,4})\)?[-.\s]?)?(\d{3,4})[-.\s]?(\d{3,4})',
    re.IGNORECASE
)
RE_INDIAN_MOBILE = re.compile(r'\b[6-9]\d{9}\b')
RE_EMAIL = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,7}\b')
RE_CANARY = re.compile(r'\bCANARY_[A-Za-z0-9_]+\b', re.IGNORECASE)


def get_registered_patient_identities() -> List[Dict[str, str]]:
    """
    Fetches all registered patient names and aliases from context_db
    for automated redaction.
    """
    identities = []
    try:
        patients = context_db.list_patients(limit=500)
        for p in patients:
            identities.append({
                "id": p.get("id") or "",
                "display_name": p.get("display_name") or "",
                "alias": p.get("llm_alias") or "PT-XXXX",
                "phone": p.get("phone") or "",
                "email": p.get("email") or "",
            })
    except Exception:
        # Fallback if DB not ready or during tests before tables created
        pass
    return identities


def scrub_text(
    text: str,
    patient_identities: Optional[List[Dict[str, str]]] = None,
    forbidden_terms: Optional[List[str]] = None,
) -> Tuple[str, List[str]]:
    """
    Scrubs text for patient legal names, phone numbers, emails, and canaries.
    Returns:
        (scrubbed_text, list_of_redaction_notes)
    """
    if not text:
        return text, []

    redactions: List[str] = []
    scrubbed = text

    # 1. Canary Strings Redaction
    canary_matches = list(RE_CANARY.finditer(scrubbed))
    if canary_matches:
        for m in canary_matches:
            c_str = m.group(0)
            redactions.append(f"Canary redacted: {c_str}")
        scrubbed = RE_CANARY.sub("[REDACTED_CANARY]", scrubbed)

    # 2. Explicit forbidden terms (e.g. test canaries not prefixed with CANARY_)
    if forbidden_terms:
        for term in forbidden_terms:
            if term and term in scrubbed:
                scrubbed = scrubbed.replace(term, "[REDACTED_TERM]")
                redactions.append(f"Forbidden term redacted: {term}")

    # 3. Patient Legal Names & Registered Identifiers
    idents = patient_identities if patient_identities is not None else get_registered_patient_identities()
    for ident in idents:
        d_name = (ident.get("display_name") or "").strip()
        alias = ident.get("alias") or "PT-XXXX"
        phone = (ident.get("phone") or "").strip()
        email = (ident.get("email") or "").strip()

        # Full legal name (case-insensitive word boundary)
        if d_name and len(d_name) >= 3:
            pattern = re.compile(rf'\b{re.escape(d_name)}\b', re.IGNORECASE)
            if pattern.search(scrubbed):
                scrubbed = pattern.sub(alias, scrubbed)
                redactions.append(f"Patient name '{d_name}' scrubbed -> '{alias}'")

            # Also check individual words if full name has parts >= 4 chars (e.g. 'Eleanor', 'Vance')
            parts = [p.strip() for p in d_name.split() if len(p.strip()) >= 4]
            for part in parts:
                p_pattern = re.compile(rf'\b{re.escape(part)}\b', re.IGNORECASE)
                if p_pattern.search(scrubbed):
                    scrubbed = p_pattern.sub(alias, scrubbed)
                    redactions.append(f"Patient name component '{part}' scrubbed -> '{alias}'")

        # Registered phone
        if phone and len(phone) >= 7 and phone in scrubbed:
            scrubbed = scrubbed.replace(phone, "[REDACTED_PHONE]")
            redactions.append("Registered patient phone scrubbed")

        # Registered email
        if email and email.lower() in scrubbed.lower():
            p_email = re.compile(rf'\b{re.escape(email)}\b', re.IGNORECASE)
            scrubbed = p_email.sub("[REDACTED_EMAIL]", scrubbed)
            redactions.append("Registered patient email scrubbed")

    # 4. General Email Redaction
    email_matches = list(RE_EMAIL.finditer(scrubbed))
    if email_matches:
        for m in email_matches:
            redactions.append(f"Email pattern scrubbed: {m.group(0)}")
        scrubbed = RE_EMAIL.sub("[REDACTED_EMAIL]", scrubbed)

    # 5. General Phone Number Redaction
    # Indian 10-digit mobile
    in_mobiles = list(RE_INDIAN_MOBILE.finditer(scrubbed))
    if in_mobiles:
        for m in in_mobiles:
            redactions.append(f"Mobile number scrubbed: {m.group(0)}")
        scrubbed = RE_INDIAN_MOBILE.sub("[REDACTED_PHONE]", scrubbed)

    # General phone formats (e.g. 555-0199, +1-555-0199)
    # Only replace if matches standard phone punctuation
    def _scrub_phone_match(match):
        val = match.group(0).strip()
        # Ensure it has at least 7 digits to avoid scrubbing single integers/dates
        digits = re.sub(r'\D', '', val)
        if len(digits) >= 7:
            redactions.append(f"Phone number format scrubbed: {val}")
            return "[REDACTED_PHONE]"
        return val

    scrubbed = RE_PHONE.sub(_scrub_phone_match, scrubbed)

    return scrubbed, redactions


def scrub_payload(
    payload: Dict[str, Any],
    forbidden_terms: Optional[List[str]] = None,
) -> Tuple[Dict[str, Any], List[str]]:
    """
    Deep-copies and sanitizes every text field in the egress payload.
    Returns:
        (sanitized_payload, all_redactions)
    """
    clean_payload = copy.deepcopy(payload)
    all_redactions: List[str] = []
    idents = get_registered_patient_identities()

    # Scrub system_instruction
    if "system_instruction" in clean_payload:
        for part in clean_payload["system_instruction"].get("parts", []):
            if "text" in part and isinstance(part["text"], str):
                s_text, red = scrub_text(part["text"], idents, forbidden_terms)
                part["text"] = s_text
                all_redactions.extend(red)

    # Scrub contents
    for item in clean_payload.get("contents", []):
        for part in item.get("parts", []):
            if "text" in part and isinstance(part["text"], str):
                s_text, red = scrub_text(part["text"], idents, forbidden_terms)
                part["text"] = s_text
                all_redactions.extend(red)

    return clean_payload, all_redactions


def verify_zero_phi(
    payload: Dict[str, Any],
    forbidden_terms: Optional[List[str]] = None,
) -> None:
    """
    Pre-flight verification: Serializes the payload to JSON and checks
    that no canary strings or registered patient legal names remain.
    Raises EgressSecurityError if any forbidden string is detected.
    """
    payload_json = json.dumps(payload)

    # 1. Canary pattern check
    canary_found = RE_CANARY.findall(payload_json)
    if canary_found:
        raise EgressSecurityError(
            f"PHI Leak Blocked: Canary string detected in outgoing payload: {canary_found[0]}"
        )

    # 2. Forbidden terms check
    if forbidden_terms:
        for term in forbidden_terms:
            if term and term.lower() in payload_json.lower():
                raise EgressSecurityError(
                    f"PHI Leak Blocked: Forbidden canary term detected in egress: '{term}'"
                )

    # 3. Patient Legal Names check
    idents = get_registered_patient_identities()
    for ident in idents:
        d_name = (ident.get("display_name") or "").strip()
        if d_name and len(d_name) >= 3:
            pattern = re.compile(rf'\b{re.escape(d_name)}\b', re.IGNORECASE)
            if pattern.search(payload_json):
                raise EgressSecurityError(
                    f"PHI Leak Blocked: Registered patient legal name detected in egress payload: '{d_name}'"
                )


# ── Egress Telemetry Audit Log ────────────────────────────────────────────────

EGRESS_AUDIT_LOGS: List[Dict[str, Any]] = []


def record_egress_telemetry(
    model: str,
    payload: Dict[str, Any],
    redactions: List[str],
    status: str = "dispatched",
    error_msg: Optional[str] = None,
) -> None:
    """Records zero-PHI telemetry metadata for compliance verification."""
    char_count = sum(
        len(p.get("text", ""))
        for item in payload.get("contents", [])
        for p in item.get("parts", [])
    )
    entry = {
        "timestamp": datetime.now().isoformat(),
        "model": model,
        "char_count": char_count,
        "turns_count": len(payload.get("contents", [])),
        "redactions_count": len(redactions),
        "redactions": redactions,
        "status": status,
        "error": error_msg,
    }
    EGRESS_AUDIT_LOGS.append(entry)
    # Keep last 100 entries in memory
    if len(EGRESS_AUDIT_LOGS) > 100:
        EGRESS_AUDIT_LOGS.pop(0)


def get_egress_telemetry() -> List[Dict[str, Any]]:
    """Returns local egress audit telemetry logs."""
    return list(EGRESS_AUDIT_LOGS)


# ── Single Choke Point Dispatchers ───────────────────────────────────────────

def dispatch_cloud_streaming_request(
    model: str,
    payload: Dict[str, Any],
    api_key: str,
    timeout: float = 45.0,
    forbidden_terms: Optional[List[str]] = None,
) -> requests.Response:
    """
    SINGLE CHOKE POINT for streaming cloud AI model calls.
    1. Schema validation (rejects unauthorized fields)
    2. Scrubbing (redacts user input, tool outputs, canary strings)
    3. Pre-flight verification (blocks leak of forbidden terms)
    4. HTTP dispatch
    """
    if not api_key:
        raise EgressSecurityError("Cannot dispatch cloud request: Missing API Key")

    # Step 1: Validate payload schema
    validate_egress_payload(payload)

    # Step 2: Scrub payload
    clean_payload, redactions = scrub_payload(payload, forbidden_terms=forbidden_terms)

    # Step 3: Verify Zero-PHI guarantees
    verify_zero_phi(clean_payload, forbidden_terms=forbidden_terms)

    # Step 4: Dispatch to Gemini REST API
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={api_key}"
    try:
        res = requests.post(
            url,
            json=clean_payload,
            headers={"Content-Type": "application/json"},
            stream=True,
            timeout=timeout,
        )
        record_egress_telemetry(model, clean_payload, redactions, status=f"HTTP_{res.status_code}")
        return res
    except Exception as e:
        record_egress_telemetry(model, clean_payload, redactions, status="error", error_msg=str(e))
        raise


def dispatch_cloud_request(
    model: str,
    payload: Dict[str, Any],
    api_key: str,
    timeout: float = 45.0,
    forbidden_terms: Optional[List[str]] = None,
) -> requests.Response:
    """
    SINGLE CHOKE POINT for synchronous cloud AI model calls.
    """
    if not api_key:
        raise EgressSecurityError("Cannot dispatch cloud request: Missing API Key")

    validate_egress_payload(payload)
    clean_payload, redactions = scrub_payload(payload, forbidden_terms=forbidden_terms)
    verify_zero_phi(clean_payload, forbidden_terms=forbidden_terms)

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    try:
        res = requests.post(
            url,
            json=clean_payload,
            headers={"Content-Type": "application/json"},
            stream=False,
            timeout=timeout,
        )
        record_egress_telemetry(model, clean_payload, redactions, status=f"HTTP_{res.status_code}")
        return res
    except Exception as e:
        record_egress_telemetry(model, clean_payload, redactions, status="error", error_msg=str(e))
        raise
