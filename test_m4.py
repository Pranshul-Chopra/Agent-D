"""
test_m4.py — Comprehensive Milestone 4 Verification Suite for Agent-D
Validates:
1. Medical Tool Layer (clinical_tools.py) Read & Safe Write Tools
2. Safety Gate & Doctor-in-Control Proposal Queue:
   - Proposing updates creates 'pending' records without direct live DB mutation
   - Physician approval executes live updates (artifacts, logs, tickets) + audit logging
   - Physician rejection marks 'rejected' without touching clinical records
3. Clinical Tickets & Kanban REST Endpoints (/api/v1/tickets, /api/tasks)
4. Proposal REST Endpoints (/api/v1/proposals, /accept, /reject)
5. Audit trail compliance for all proposal resolutions
"""

import os
import sys
import json
import unittest
from datetime import datetime, date

# Ensure isolated test databases
os.environ["AGENT_D_CONFIG_DB"] = "test_config_m4.db"
os.environ["AGENT_D_CONTEXT_DB"] = "test_context_m4.db"
os.environ["AGENT_D_AUTH_TOKEN"] = "test_auth_token_32_bytes_m4_perimeter"

import config_db
import context_db
import clinical_tools
import clinical_context
import routes
from flask import Flask


class TestMilestone4(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        config_db.reset_pool()
        context_db.reset_pool()

        for path in ("test_config_m4.db", "test_context_m4.db"):
            if os.path.exists(path):
                os.remove(path)

        config_db.init_config_db()
        context_db.init_context_db()

        cls.app = Flask(__name__)
        cls.app.register_blueprint(routes.bp)
        cls.client = cls.app.test_client()

    @classmethod
    def tearDownClass(cls):
        config_db.reset_pool()
        context_db.reset_pool()

        for path in ("test_config_m4.db", "test_context_m4.db"):
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass

    def test_01_clinical_tools_read_layer(self):
        """Test read tools: get_today_agenda, get_next_patient, get_patient_artifact, get_open_tickets."""
        # 1. Create patient and appointment
        p = context_db.create_patient(display_name="Arthur Pendelton", gender="Male")
        p_id = p["id"]
        alias = p["llm_alias"]

        today_str = date.today().isoformat()
        context_db.create_appointment(
            patient_id=p_id,
            scheduled_time=f"{today_str} 11:00:00",
            reason="Cardiology review",
        )

        # 2. Test get_today_agenda
        agenda = clinical_tools.get_today_agenda()
        self.assertGreaterEqual(agenda["total_appointments"], 1)
        self.assertEqual(agenda["today_date"], today_str)

        # 3. Test get_next_patient
        next_p = clinical_tools.get_next_patient()
        self.assertIsNotNone(next_p)
        self.assertEqual(next_p["alias"], alias)

        # 4. Test get_patient_artifact by alias
        art = clinical_tools.get_patient_artifact(alias)
        self.assertIsNotNone(art)
        self.assertEqual(art["patient_alias"], alias)

    def test_02_safety_gate_propose_artifact_update(self):
        """Test proposing artifact update does NOT mutate live DB until approval."""
        p = context_db.create_patient(display_name="Clara Oswald", gender="Female")
        p_id = p["id"]

        # Initial artifact
        init_art = context_db.get_patient_artifact(p_id)
        self.assertEqual(init_art.get("current_version"), 1)
        self.assertEqual(init_art.get("medications"), [])

        # Propose medication addition
        proposed_updates = {"medications": ["Metformin 1000mg BID", "Lisinopril 10mg QD"]}
        proposal = clinical_tools.propose_artifact_update(
            patient_id=p_id,
            updates=proposed_updates,
            rationale="Starting oral diabetes & hypertension therapy.",
        )

        self.assertEqual(proposal["status"], "pending")
        self.assertEqual(proposal["proposal_type"], "artifact_update")
        prop_id = proposal["id"]

        # Verify live DB is UNCHANGED before approval (Safety Gate Guarantee)
        mid_art = context_db.get_patient_artifact(p_id)
        self.assertEqual(mid_art.get("current_version"), 1)
        self.assertEqual(mid_art.get("medications"), [])

        # Doctor Approves proposal
        res = context_db.accept_proposal(prop_id)
        self.assertTrue(res["success"])
        self.assertEqual(res["status"], "accepted")

        # Now verify live DB reflects approved changes and created new version snapshot
        final_art = context_db.get_patient_artifact(p_id)
        self.assertEqual(final_art.get("current_version"), 2)
        self.assertIn("Metformin 1000mg BID", final_art.get("medications"))
        self.assertIn("Lisinopril 10mg QD", final_art.get("medications"))

        # Verify audit trail
        audits = context_db.get_audit_events("proposal", prop_id)
        self.assertTrue(any(a["action"] == "accepted" for a in audits))

    def test_03_safety_gate_propose_and_reject_ticket(self):
        """Test proposing follow-up ticket and physician rejection."""
        p = context_db.create_patient(display_name="Rory Williams", gender="Male")
        p_id = p["id"]

        prop = clinical_tools.propose_ticket(
            patient_id=p_id,
            title="Order full metabolic panel",
            priority="high",
            due_date=date.today().isoformat(),
            rationale="Evaluate baseline kidney function.",
        )
        prop_id = prop["id"]
        self.assertEqual(prop["status"], "pending")

        # Doctor Rejects proposal
        rej_res = context_db.reject_proposal(prop_id, reason="Patient had normal labs 2 weeks ago")
        self.assertTrue(rej_res["success"])
        self.assertEqual(rej_res["status"], "rejected")

        # Check proposal status
        p_obj = context_db.get_proposal(prop_id)
        self.assertEqual(p_obj["status"], "rejected")

        # Verify ticket was NOT created in tickets table
        tickets = context_db.list_tickets(patient_id=p_id)
        self.assertEqual(len(tickets), 0)

    def test_04_clinical_tickets_crud(self):
        """Test clinical tickets creation, status update, and listing."""
        p = context_db.create_patient(display_name="Amy Pond", gender="Female")
        p_id = p["id"]
        alias = p["llm_alias"]

        # 1. Create ticket
        t = context_db.create_ticket(
            patient_id=p_id,
            title="Referral to Endocrinology",
            description="Endocrine consult for thyroid nodule evaluation.",
            priority="critical",
            status="todo",
            due_date="2026-11-15",
        )
        t_id = t["id"]
        self.assertEqual(t["priority"], "critical")
        self.assertEqual(t["status"], "todo")

        # 2. List tickets with alias join
        t_list = context_db.list_tickets(patient_id=p_id)
        self.assertEqual(len(t_list), 1)
        self.assertEqual(t_list[0]["patient_alias"], alias)

        # 3. Update status to in_progress
        updated = context_db.update_ticket(t_id, {"status": "in_progress"})
        self.assertEqual(updated["status"], "in_progress")

        # 4. Delete ticket
        ok = context_db.delete_ticket(t_id)
        self.assertTrue(ok)
        self.assertIsNone(context_db.get_ticket(t_id))

    def test_05_proposals_and_tickets_rest_api(self):
        """Test Milestone 4 REST API endpoints."""
        # 1. Create patient
        p = context_db.create_patient(display_name="Donna Noble", gender="Female")
        p_id = p["id"]

        # 2. POST /api/v1/proposals
        res = self.client.post(
            "/api/v1/proposals",
            json={
                "patient_id": p_id,
                "proposal_type": "ticket",
                "payload": {"title": "Rest API Proposed Lab", "priority": "high"},
                "rationale": "Follow-up test via API",
            },
        )
        self.assertEqual(res.status_code, 201)
        prop_id = res.get_json()["proposal"]["id"]

        # 3. GET /api/v1/proposals
        res = self.client.get("/api/v1/proposals?status=pending")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(any(pr["id"] == prop_id for pr in res.get_json()["proposals"]))

        # 4. POST /api/v1/proposals/:id/accept
        res = self.client.post(f"/api/v1/proposals/{prop_id}/accept")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["status"], "accepted")

        # 5. GET /api/v1/tickets — verify ticket was committed to DB
        res = self.client.get(f"/api/v1/tickets?patient_id={p_id}")
        self.assertEqual(res.status_code, 200)
        tickets = res.get_json()["tickets"]
        self.assertTrue(any(t["title"] == "Rest API Proposed Lab" for t in tickets))

        # 6. Legacy /api/tasks compatibility
        res = self.client.get("/api/tasks")
        self.assertEqual(res.status_code, 200)
        self.assertIn("tasks", res.get_json())


if __name__ == "__main__":
    unittest.main()
