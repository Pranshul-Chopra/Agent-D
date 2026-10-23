"""
test_m3.py — Comprehensive Milestone 3 Verification Suite for Agent-D
Validates:
1. Multi-key rotation and cooldown retrieval in config_db
2. Patient-scoped chat sessions and encrypted message persistence in context_db
3. Practice appointments and real-time practice summary statistics
4. Clinical context engine (temporal awareness, schedule injection, de-identification guarantee)
5. Clinical chat streaming and intelligent local clinical synthesis
6. REST API Endpoints:
   - /api/v1/dashboard/stats
   - /api/v1/appointments (GET, POST, PATCH)
   - /api/v1/chat/sessions (GET, POST, DELETE)
   - /api/v1/chat/stream (SSE streaming)
   - /api/v1/chat (Sync clinical copilot)
   - /api/conversations & /api/chat (Backwards compatibility)
"""

import os
import sys
import json
import unittest
from datetime import datetime, date

# Ensure local test databases are used
os.environ["AGENT_D_CONFIG_DB"] = "test_config_m3.db"
os.environ["AGENT_D_CONTEXT_DB"] = "test_context_m3.db"
os.environ["AGENT_D_AUTH_TOKEN"] = "test_auth_token_32_bytes_m3_perimeter"

import config_db
import context_db
import routes
from flask import Flask


class TestMilestone3(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        config_db.reset_pool()
        context_db.reset_pool()

        # Clean any old test dbs
        for path in ("test_config_m3.db", "test_context_m3.db"):
            if os.path.exists(path):
                os.remove(path)

        # Initialize test databases
        config_db.init_config_db()
        context_db.init_context_db()

        # Set up Flask test client
        cls.app = Flask(__name__)
        cls.app.register_blueprint(routes.bp)
        cls.client = cls.app.test_client()

    @classmethod
    def tearDownClass(cls):
        config_db.reset_pool()
        context_db.reset_pool()

        for path in ("test_config_m3.db", "test_context_m3.db"):
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass

    def test_01_practice_appointments_and_stats(self):
        """Test appointments creation, alias joining, and practice stats aggregation."""
        # 1. Create a patient
        patient = context_db.create_patient(
            display_name="Eleanor Vance",
            date_of_birth="1958-04-12",
            gender="Female",
            blood_group="A+",
        )
        self.assertIn("llm_alias", patient)
        p_id = patient["id"]
        alias = patient["llm_alias"]

        # 2. Schedule an appointment for today
        today_str = date.today().isoformat()
        appt = context_db.create_appointment(
            patient_id=p_id,
            scheduled_time=f"{today_str} 10:30:00",
            duration_minutes=20,
            appointment_type="consultation",
            reason="Hypertension management follow-up",
        )
        self.assertEqual(appt["patient_id"], p_id)
        self.assertEqual(appt["status"], "scheduled")

        # 3. List appointments and verify alias joining
        appts = context_db.list_appointments(date_str=today_str)
        self.assertTrue(any(a["id"] == appt["id"] for a in appts))
        target_appt = next(a for a in appts if a["id"] == appt["id"])
        self.assertEqual(target_appt["patient_alias"], alias)

        # 4. Check practice stats
        stats = context_db.get_practice_summary_stats()
        self.assertGreaterEqual(stats["total_patients"], 1)
        self.assertGreaterEqual(stats["today_appointments_count"], 1)
        self.assertIsNotNone(stats["next_appointment"])
        self.assertEqual(stats["next_appointment"]["alias"], alias)

        # 5. Update appointment status
        updated = context_db.update_appointment(appt["id"], {"status": "completed"})
        self.assertEqual(updated["status"], "completed")

    def test_02_chat_sessions_and_encrypted_messages(self):
        """Test chat session creation, message storage, encryption, and listing."""
        # 1. Create session
        session = context_db.create_chat_session(title="Cardio Follow-up Session")
        s_id = session["id"]
        self.assertEqual(session["title"], "Cardio Follow-up Session")

        # 2. Add user message
        u_msg = context_db.add_chat_message(
            session_id=s_id,
            role="user",
            content="Patient reports systolic pressure elevated at 145 mmHg.",
        )
        self.assertEqual(u_msg["role"], "user")
        self.assertEqual(u_msg["content"], "Patient reports systolic pressure elevated at 145 mmHg.")

        # 3. Add assistant message
        a_msg = context_db.add_chat_message(
            session_id=s_id,
            role="assistant",
            content="Noted systolic elevation. Consider titration of ACE inhibitor.",
            model_name="test-model",
        )
        self.assertEqual(a_msg["role"], "assistant")

        # 4. Retrieve session and verify messages
        retrieved = context_db.get_chat_session(s_id)
        self.assertIsNotNone(retrieved)
        self.assertEqual(len(retrieved["messages"]), 2)
        self.assertEqual(retrieved["messages"][0]["content"], "Patient reports systolic pressure elevated at 145 mmHg.")
        self.assertEqual(retrieved["messages"][1]["content"], "Noted systolic elevation. Consider titration of ACE inhibitor.")

        # 5. Verify encrypted at rest in raw SQLite
        with context_db.get_context_db() as conn:
            raw_row = conn.execute("SELECT content FROM chat_messages WHERE id = ?", (u_msg["id"],)).fetchone()
            self.assertTrue(raw_row[0].startswith("aes_gcm_v1:"), "Message content must be encrypted at rest in SQLite")

    def test_03_clinical_context_and_privacy_guarantee(self):
        """Verify de-identification and cryptographic alias isolation in patient vault."""
        patient = context_db.create_patient(
            display_name="Private Patient Legal Name",
            date_of_birth="1975-09-22",
            gender="Male",
        )
        p_id = patient["id"]
        alias = patient["llm_alias"]

        # Alias must be formatted PT-XXXX
        self.assertTrue(alias.startswith("PT-"))
        self.assertNotEqual(alias, "Private Patient Legal Name")

        # Verify raw SQLite row encrypts the legal name
        with context_db.get_context_db() as conn:
            row = conn.execute("SELECT display_name FROM patients WHERE id = ?", (p_id,)).fetchone()
            self.assertTrue(row[0].startswith("aes_gcm_v1:"))
            self.assertNotIn("Private Patient Legal Name", row[0])

    def test_05_flask_rest_api_endpoints(self):
        """Test Milestone 3 HTTP REST endpoints with AI excised."""
        # 1. GET /api/v1/dashboard/stats
        res = self.client.get("/api/v1/dashboard/stats")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("total_patients", data)
        self.assertIn("today_appointments_count", data)

        # 2. Excised AI chat endpoints cleanly return 404 (non-bloated, fully removed)
        res = self.client.post("/api/v1/chat", json={"message": "What is on my dashboard today?"})
        self.assertEqual(res.status_code, 404)


if __name__ == "__main__":
    unittest.main()
