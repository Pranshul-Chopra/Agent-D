"""
test_canary_egress.py — Comprehensive Canary String & Single Egress Choke Point Verification Suite.
Validates:
1. Strict schema validation on outgoing cloud payloads (rejects unknown/unauthorized fields).
2. User message & tool output scrubbing: Patient legal names, phone numbers, emails,
   and canary strings are scrubbed before cloud transmission.
3. Chat replay sanitization: Past conversation history containing canary strings
   is sanitized before reaching the cloud model payload.
4. Token-only practice briefs: Cloud system prompts and briefs contain ONLY safe token
   aliases (PT-XXXX) and consultation slots, completely omitting diagnoses and drugs.
5. Pre-flight Zero-PHI verification: EgressSecurityError is raised and transmission
   is aborted if any canary string or registered patient PII is found.
6. Single Egress Choke Point: All outbound network requests route through cloud_egress.py.
"""

import os
import sys
import json
import unittest
from datetime import datetime, date
from unittest.mock import patch, MagicMock

# Isolated test databases
os.environ["AGENT_D_CONFIG_DB"] = "test_config_canary.db"
os.environ["AGENT_D_CONTEXT_DB"] = "test_context_canary.db"
os.environ["AGENT_D_AUTH_TOKEN"] = "test_auth_token_32_bytes_canary_perimeter"

import config_db
import context_db
import clinical_context
import clinical_chat
import cloud_egress


# Canonical canary strings
CANARY_PATIENT_NAME = "Eleanor Vance"
CANARY_PATIENT_CANARY_NAME = "CANARY_PATIENT_ELEANOR_VANCE"
CANARY_DRUG = "CANARY_DRUG_XYLOPROFEN"
CANARY_PHONE = "9876543210"
CANARY_PHONE_FORMATTED = "555-0199"
CANARY_EMAIL = "eleanor.vance@canary-clinic.test"
CANARY_DIAGNOSIS = "CANARY_DIAGNOSIS_ACUTE_ZEBRA_SYNDROME"


class TestCanaryEgress(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        config_db.reset_pool()
        context_db.reset_pool()

        for path in ("test_config_canary.db", "test_context_canary.db"):
            if os.path.exists(path):
                os.remove(path)

        config_db.init_config_db()
        context_db.init_context_db()

        # Seed test patient with canaries
        cls.patient = context_db.create_patient(
            display_name=CANARY_PATIENT_NAME,
            date_of_birth="1960-05-15",
            gender="Female",
            blood_group="O+",
            phone=CANARY_PHONE,
            email=CANARY_EMAIL,
        )
        cls.patient_id = cls.patient["id"]
        cls.patient_alias = cls.patient["llm_alias"]

        # Seed clinical artifact with canary drug & diagnosis
        context_db.update_patient_artifact(
            patient_id=cls.patient_id,
            data={
                "summary": f"Patient diagnosed with {CANARY_DIAGNOSIS}.",
                "active_issues": [CANARY_DIAGNOSIS],
                "medications": [CANARY_DRUG],
                "watch_for": ["Drug interaction monitoring"],
            },
            change_summary="Initial clinical canary artifact",
        )

        # Seed appointment
        today_str = date.today().isoformat()
        cls.appointment = context_db.create_appointment(
            patient_id=cls.patient_id,
            scheduled_time=f"{today_str} 14:00:00",
            duration_minutes=20,
            appointment_type="consultation",
            reason="Follow-up consultation",
        )

    @classmethod
    def tearDownClass(cls):
        config_db.reset_pool()
        context_db.reset_pool()

        for path in ("test_config_canary.db", "test_context_canary.db"):
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass

    # ── Test 1: Strict Schema Validation & Unknown Field Rejection ────────────

    def test_01_schema_validation_rejects_unknown_root_keys(self):
        """Egress must reject payloads containing unauthorized root fields."""
        payload = {
            "contents": [{"role": "user", "parts": [{"text": "Hello"}]}],
            "patient_notes": "Clinical note that should never be a root key",
        }
        with self.assertRaises(cloud_egress.EgressSecurityError) as ctx:
            cloud_egress.validate_egress_payload(payload)
        self.assertIn("Disallowed root key", str(ctx.exception))
        self.assertIn("patient_notes", str(ctx.exception))

    def test_02_schema_validation_rejects_disallowed_content_keys(self):
        """Egress must reject unknown keys inside content objects."""
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": "Hello"}],
                    "patient_ssn": "000-11-2222",
                }
            ]
        }
        with self.assertRaises(cloud_egress.EgressSecurityError) as ctx:
            cloud_egress.validate_egress_payload(payload)
        self.assertIn("Disallowed key in contents", str(ctx.exception))
        self.assertIn("patient_ssn", str(ctx.exception))

    def test_03_schema_validation_rejects_disallowed_generation_config(self):
        """Egress must reject unauthorized keys in generationConfig."""
        payload = {
            "contents": [{"role": "user", "parts": [{"text": "Hello"}]}],
            "generationConfig": {
                "temperature": 0.3,
                "inject_clinical_records": True,
            }
        }
        with self.assertRaises(cloud_egress.EgressSecurityError) as ctx:
            cloud_egress.validate_egress_payload(payload)
        self.assertIn("Disallowed key in generationConfig", str(ctx.exception))

    def test_04_schema_validation_accepts_valid_payload(self):
        """Valid standard Gemini payload passes schema verification."""
        payload = {
            "system_instruction": {"parts": [{"text": "You are an assistant."}]},
            "contents": [
                {"role": "user", "parts": [{"text": "What is the schedule?"}]},
                {"role": "model", "parts": [{"text": "Here is today's schedule."}]},
                {"role": "user", "parts": [{"text": "Thanks."}]},
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 2048,
            }
        }
        # Should not raise
        cloud_egress.validate_egress_payload(payload)

    # ── Test 2: Pre-send User Message Scrubbing ────────────────────────────────

    def test_05_user_message_scrubbing(self):
        """Physician chat message with patient legal name, phone, email, and drug must be scrubbed."""
        raw_msg = (
            f"Review chart for {CANARY_PATIENT_NAME}, reachable at {CANARY_PHONE} "
            f"or {CANARY_EMAIL}. They are taking {CANARY_DRUG}."
        )

        scrubbed, redactions = cloud_egress.scrub_text(raw_msg)

        # Assert no canary strings or identifiers remain
        self.assertNotIn(CANARY_PATIENT_NAME, scrubbed)
        self.assertNotIn(CANARY_PHONE, scrubbed)
        self.assertNotIn(CANARY_EMAIL, scrubbed)
        self.assertNotIn(CANARY_DRUG, scrubbed)

        # Assert patient alias was substituted
        self.assertIn(self.patient_alias, scrubbed)
        self.assertIn("[REDACTED_PHONE]", scrubbed)
        self.assertIn("[REDACTED_EMAIL]", scrubbed)
        self.assertIn("[REDACTED_CANARY]", scrubbed)
        self.assertGreaterEqual(len(redactions), 4)

    # ── Test 3: Chat Replay History Sanitization ──────────────────────────────

    def test_06_chat_replay_sanitization(self):
        """Multi-turn conversation history containing canary strings must be scrubbed before egress."""
        dirty_payload = {
            "system_instruction": {"parts": [{"text": "System instructions"}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": f"Patient {CANARY_PATIENT_NAME} complained of dizziness."}],
                },
                {
                    "role": "model",
                    "parts": [{"text": f"Noted. Advise patient to call {CANARY_PHONE}."}],
                },
                {
                    "role": "user",
                    "parts": [{"text": f"Can we titrate {CANARY_DRUG} for {CANARY_PATIENT_CANARY_NAME}?"}],
                },
            ],
        }

        clean_payload, redactions = cloud_egress.scrub_payload(dirty_payload)
        clean_json = json.dumps(clean_payload)

        # Assert zero canaries exist in the sanitized payload
        self.assertNotIn(CANARY_PATIENT_NAME, clean_json)
        self.assertNotIn(CANARY_PATIENT_CANARY_NAME, clean_json)
        self.assertNotIn(CANARY_PHONE, clean_json)
        self.assertNotIn(CANARY_DRUG, clean_json)

    # ── Test 4: Briefs and Practice Schedule Zero-PHI Boundary ─────────────────

    def test_07_prompt_and_briefs_omit_chart_artifacts(self):
        """Cloud system prompt & briefs must NOT inject diagnoses, vitals, or medications."""
        # Active patient has CANARY_DRUG and CANARY_DIAGNOSIS in local context.db
        prompt = clinical_context.get_clinical_system_prompt(
            patient_id=self.patient_id,
            cloud_boundary=True,
        )

        # Prompt must contain alias and consultation slot
        self.assertIn(self.patient_alias, prompt)
        self.assertIn("REAL-TIME PRACTICE TEMPORAL CONTEXT", prompt)

        # Prompt must NEVER contain canary patient name, canary drug, or canary diagnosis!
        self.assertNotIn(CANARY_PATIENT_NAME, prompt)
        self.assertNotIn(CANARY_DRUG, prompt)
        self.assertNotIn(CANARY_DIAGNOSIS, prompt)
        self.assertNotIn(CANARY_PHONE, prompt)
        self.assertNotIn(CANARY_EMAIL, prompt)

    # ── Test 5: Pre-flight Zero-PHI Verification Blocks Leaks ─────────────────

    def test_08_pre_flight_verification_blocks_unscrubbed_canary(self):
        """verify_zero_phi must raise EgressSecurityError if a canary string leaks into payload."""
        leaky_payload = {
            "contents": [
                {"role": "user", "parts": [{"text": f"Secret code: {CANARY_DRUG}"}]}
            ]
        }
        with self.assertRaises(cloud_egress.EgressSecurityError) as ctx:
            cloud_egress.verify_zero_phi(leaky_payload)
        self.assertIn("Canary string detected", str(ctx.exception))

    def test_09_pre_flight_verification_blocks_patient_legal_name(self):
        """verify_zero_phi must raise EgressSecurityError if patient legal name is present."""
        leaky_payload = {
            "contents": [
                {"role": "user", "parts": [{"text": f"Patient: {CANARY_PATIENT_NAME}"}]}
            ]
        }
        with self.assertRaises(cloud_egress.EgressSecurityError) as ctx:
            cloud_egress.verify_zero_phi(leaky_payload)
        self.assertIn("Registered patient legal name detected", str(ctx.exception))

    # ── Test 6: Single Choke Point Dispatch Integration ──────────────────────

    @patch("cloud_egress.requests.post")
    def test_10_single_choke_point_dispatches_clean_payload_only(self, mock_post):
        """
        When dispatching through cloud_egress, the exact HTTP payload received
        by the network client must have zero canaries and conform strictly to schema.
        """
        # Set up mock response
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.iter_lines.return_value = [
            b'data: {"candidates": [{"content": {"parts": [{"text": "Understood. Practice schedule is ready."}]}}]}'
        ]
        mock_post.return_value = mock_resp

        # Payload containing doctor input with canaries
        raw_payload = {
            "system_instruction": {"parts": [{"text": "You are Agent-D assistant."}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [{
                        "text": f"Book consultation for {CANARY_PATIENT_NAME} ({CANARY_PHONE}) taking {CANARY_DRUG}."
                    }],
                }
            ],
            "generationConfig": {"temperature": 0.2},
        }

        res = cloud_egress.dispatch_cloud_streaming_request(
            model="gemini-2.0-flash",
            payload=raw_payload,
            api_key="AIzaSyTestCanaryKey12345678901234567890",
        )

        self.assertEqual(res.status_code, 200)
        self.assertTrue(mock_post.called)

        # Inspect the ACTUAL payload passed to requests.post
        call_kwargs = mock_post.call_args[1]
        dispatched_payload = call_kwargs["json"]
        dispatched_json = json.dumps(dispatched_payload)

        # ZERO CANARY ASSERTION
        self.assertNotIn(CANARY_PATIENT_NAME, dispatched_json)
        self.assertNotIn(CANARY_DRUG, dispatched_json)
        self.assertNotIn(CANARY_PHONE, dispatched_json)
        self.assertNotIn(CANARY_EMAIL, dispatched_json)
        self.assertNotIn(CANARY_DIAGNOSIS, dispatched_json)

        # Verify alias is present instead of legal name
        self.assertIn(self.patient_alias, dispatched_json)

        # Verify telemetry was recorded
        telemetry = cloud_egress.get_egress_telemetry()
        self.assertGreaterEqual(len(telemetry), 1)
        latest = telemetry[-1]
        self.assertEqual(latest["model"], "gemini-2.0-flash")
        self.assertGreaterEqual(latest["redactions_count"], 3)


if __name__ == "__main__":
    unittest.main()
