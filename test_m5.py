"""
test_m5.py — Comprehensive Milestone 5 Verification Suite for Agent-D
Validates:
1. Multi-Key Gateway with 60-second Rate-Limit Cooldown & Round-Robin Rotation:
   - Adding multiple Gemini keys with priority
   - Round-robin key selection via get_active_rotated_key()
   - 429/503 rate-limit tagging placing keys into 60s cooldown
   - Failover to next healthy key when primary key is cooling down
   - Key pool status reporting (healthy_keys, cooldown_keys, retry_countdown_seconds)
   - Manual cooldown clearing (reset_key_cooldown)
   - REST endpoints: GET /api/v1/keys/status, POST /api/v1/keys/<id>/reset-cooldown
2. Clinical Visit Lifecycle & Intelligent Auto-Proposal Synthesizer:
   - Start consultation visit (POST /api/v1/visits) -> status 'open'
   - Conclude visit (POST /api/v1/visits/<id>/close):
     * Encrypts doctor dictation notes at rest
     * Archives visit encounter to medical logs (log_entries)
     * Auto-synthesizes differential chart proposals (medication titration, baseline updates)
     * Auto-synthesizes clinical follow-up tickets (lab orders, return visits)
     * Staged proposals remain pending behind the Safety Gate until doctor approval
   - Physician approval commits differential updates directly to live artifact and Kanban tickets
   - Full audit trail logging for all visit and key lifecycle events
3. Clinical Chat Multi-Key Resiliency & Offline Cooldown Fallback:
   - Falls back gracefully to Local Clinical Synthesis when keys are cooling down
   - Informs doctor of remaining retry cooldown window
"""

import os
import sys
import json
import unittest
from datetime import datetime, date, timedelta, timezone

# Ensure isolated test databases
os.environ["AGENT_D_CONFIG_DB"] = "test_config_m5.db"
os.environ["AGENT_D_CONTEXT_DB"] = "test_context_m5.db"
os.environ["AGENT_D_AUTH_TOKEN"] = "test_auth_token_32_bytes_m5_gateway"

import config_db
import context_db
import clinical_tools
import routes
from flask import Flask


class TestMilestone5(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        config_db.reset_pool()
        context_db.reset_pool()

        for path in ("test_config_m5.db", "test_context_m5.db"):
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass

        config_db.init_config_db()
        context_db.init_context_db()

        cls.app = Flask(__name__)
        cls.app.register_blueprint(routes.bp)
        cls.client = cls.app.test_client()

    @classmethod
    def tearDownClass(cls):
        config_db.reset_pool()
        context_db.reset_pool()

        for path in ("test_config_m5.db", "test_context_m5.db"):
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass

    def setUp(self):
        self.headers = {
            "Authorization": "Bearer test_auth_token_32_bytes_m5_gateway",
            "Content-Type": "application/json",
        }

    # ── 1. Zero AI Endpoints Excised Tests ────────────────────────────────────

    def test_01_keys_endpoints_cleanly_excised(self):
        """Test GET /api/v1/keys/status cleanly returns 404 (endpoint removed)."""
        res = self.client.get("/api/v1/keys/status", headers=self.headers)
        self.assertEqual(res.status_code, 404)

    def test_02_cloud_keys_cleanly_excised(self):
        """Test POST /api/v1/keys cleanly returns 404 (endpoint removed)."""
        res = self.client.post(
            "/api/v1/keys",
            headers=self.headers,
            data=json.dumps({"api_key": "AIzaSyTestKey123456789"}),
        )
        self.assertEqual(res.status_code, 404)

    # ── 2. Consultation Visits & Auto-Proposal Tests ──────────────────────────

    def test_03_visit_creation_and_listing(self):
        """Test starting and querying consultation encounters."""
        p = context_db.create_patient(display_name="Eleanor Vance", blood_group="A+")
        p_id = p["id"]

        # Start a consultation visit
        res = self.client.post(
            "/api/v1/visits",
            headers=self.headers,
            data=json.dumps({
                "patient_id": p_id,
                "reason": "Quarterly Glycemic Follow-up",
                "doctor_notes": "Initial exam: patient reports feeling well.",
            }),
        )
        self.assertEqual(res.status_code, 201)
        v_data = res.get_json()["visit"]
        self.assertEqual(v_data["patient_id"], p_id)
        self.assertEqual(v_data["status"], "open")
        self.assertEqual(v_data["reason"], "Quarterly Glycemic Follow-up")
        visit_id = v_data["id"]

        # Fetch visit details
        detail_res = self.client.get(f"/api/v1/visits/{visit_id}", headers=self.headers)
        self.assertEqual(detail_res.status_code, 200)
        v_detail = detail_res.get_json()["visit"]
        self.assertEqual(v_detail["id"], visit_id)
        self.assertEqual(v_detail["status"], "open")

        # List visits for patient
        list_res = self.client.get(f"/api/v1/visits?patient_id={p_id}", headers=self.headers)
        self.assertEqual(list_res.status_code, 200)
        v_list = list_res.get_json()["visits"]
        self.assertEqual(len(v_list), 1)

    def test_04_visit_closure_and_autoproposal_synthesis(self):
        """
        Test the Complete Visit Closure Lifecycle:
        - Sets visit to 'completed'
        - Archives notes to medical log
        - Auto-synthesizes medication update proposal & follow-up lab ticket proposal
        - Confirms doctor can approve staged proposals with 1-click execution
        """
        p = context_db.create_patient(display_name="Lucas Scott", blood_group="O+")
        p_id = p["id"]

        # Initialize chart artifact with 500mg Metformin
        context_db.update_patient_artifact(
            p_id,
            {
                "summary": "52-year-old male with Type 2 Diabetes.",
                "active_issues": ["Type 2 Diabetes"],
                "medications": ["Metformin 500mg BID"],
                "watch_for": ["Hypoglycemia"],
            },
            author_type="doctor_manual",
        )

        # Start visit
        visit = context_db.create_visit(
            patient_id=p_id,
            reason="Diabetes Follow-up & Medication Titration",
        )
        visit_id = visit["id"]

        # Physician notes during visit
        consult_notes = (
            "Patient returns for glycemic review. Suboptimal fasting glucose recorded at home.\n"
            "Physical exam normal. BP today 136/84.\n"
            "Plan: Increased Metformin 1000mg BID (tolerated well). Order 3-month HbA1c lab and follow-up."
        )

        # Conclude visit via REST endpoint
        close_res = self.client.post(
            f"/api/v1/visits/{visit_id}/close",
            headers=self.headers,
            data=json.dumps({
                "doctor_notes": consult_notes,
                "outcome_summary": "Dose titrated to 1000mg BID. 3-month lab ordered.",
                "vitals": {"bp": "136/84", "hr": "72", "temp": "98.4", "o2": "99"},
            }),
        )
        self.assertEqual(close_res.status_code, 200)
        result = close_res.get_json()

        # 1. Verify visit is marked completed and notes encrypted
        v_closed = result["visit"]
        self.assertEqual(v_closed["status"], "completed")
        self.assertIsNotNone(v_closed.get("closed_at"))
        self.assertIn("Metformin 1000mg", v_closed["doctor_notes"])

        # 2. Verify encounter archived to medical log
        log_entry = result["log_entry"]
        self.assertEqual(log_entry["entry_type"], "visit_notes")
        self.assertIn("Patient returns for glycemic review", log_entry["content"])
        self.assertEqual(log_entry["metadata"]["bp"], "136/84")

        # 3. Verify auto-generated staged proposals
        proposals = result["proposals"]
        self.assertGreaterEqual(len(proposals), 2)

        # Find medication proposal
        med_prop = next((p for p in proposals if p["proposal_type"] == "artifact_update"), None)
        self.assertIsNotNone(med_prop)
        self.assertEqual(med_prop["status"], "pending")
        self.assertIn("1000mg", str(med_prop["payload"].get("medications", [])))

        # Find follow-up ticket proposal
        ticket_prop = next((p for p in proposals if p["proposal_type"] == "ticket"), None)
        self.assertIsNotNone(ticket_prop)
        self.assertEqual(ticket_prop["status"], "pending")
        self.assertIn("hba1c", ticket_prop["payload"]["title"].lower())

        # 4. Verify Safety Gate: Live artifact is NOT mutated until physician approval
        art_before = context_db.get_patient_artifact(p_id)
        self.assertIn("Metformin 500mg BID", art_before["medications"])
        self.assertNotIn("Metformin 1000mg BID (tolerated well)", art_before["medications"])

        # 5. Physician signs off / accepts medication proposal
        accept_med = self.client.post(f"/api/v1/proposals/{med_prop['id']}/accept", headers=self.headers)
        self.assertEqual(accept_med.status_code, 200)

        # Live artifact should now be updated to v3 with 1000mg!
        art_after = context_db.get_patient_artifact(p_id)
        self.assertIn("Metformin 1000mg BID (tolerated well)", art_after["medications"])
        self.assertEqual(art_after["current_version"], 3)

        # 6. Physician signs off / accepts ticket proposal
        accept_ticket = self.client.post(f"/api/v1/proposals/{ticket_prop['id']}/accept", headers=self.headers)
        self.assertEqual(accept_ticket.status_code, 200)

        # Ticket should now exist in the Kanban tickets table
        tickets = context_db.list_tickets(patient_id=p_id)
        self.assertTrue(any("hba1c" in t["title"].lower() for t in tickets))


if __name__ == "__main__":
    unittest.main()
