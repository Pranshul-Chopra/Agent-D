"""
test_m6_actions.py — Unit tests for approval-first CRUD proposals & execute_action.
"""

import os
import unittest
import json
from flask import Flask

os.environ["AGENT_D_CONFIG_DB"] = "test_config_m6.db"
os.environ["AGENT_D_CONTEXT_DB"] = "test_context_m6.db"
os.environ["AGENT_D_AUTH_TOKEN"] = "test_auth_token_32_bytes_m6"

import config_db
import context_db
import clinical_tools
import routes


class TestM6Actions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        config_db.reset_pool()
        context_db.reset_pool()
        for path in ("test_config_m6.db", "test_context_m6.db"):
            if os.path.exists(path):
                os.remove(path)
        config_db.init_config_db()
        context_db.init_context_db()

        cls.app = Flask(__name__)
        cls.app.config["TESTING"] = True
        cls.app.register_blueprint(routes.bp)
        cls.client = cls.app.test_client()

    def setUp(self):
        self.patient = context_db.create_patient(
            display_name="Test Action Patient",
            date_of_birth="1985-05-12",
            gender="Female",
        )

    def test_propose_and_accept_consultation(self):
        prop = clinical_tools.propose_consultation(
            patient_id=self.patient["id"],
            scheduled_time="2026-10-25 11:00",
            duration_minutes=30,
            appointment_type="follow_up",
            reason="Blood pressure review",
        )
        self.assertIsNotNone(prop.get("id"))
        self.assertEqual(prop.get("proposal_type"), "consultation")

        result = context_db.accept_proposal(prop["id"])
        self.assertTrue(result.get("success"))
        self.assertEqual(result.get("status"), "accepted")

        appts = context_db.list_appointments(patient_id=self.patient["id"])
        self.assertTrue(any(a["reason"] == "Blood pressure review" for a in appts))

    def test_propose_and_accept_dashboard_task(self):
        prop = clinical_tools.propose_dashboard_task(
            title="Review weekly lab reports",
            priority="high",
            due_date="2026-10-23",
        )
        self.assertIsNotNone(prop.get("id"))
        self.assertEqual(prop.get("proposal_type"), "dashboard_task")

        result = context_db.accept_proposal(prop["id"])
        self.assertTrue(result.get("success"))

        tickets = context_db.list_tickets()
        self.assertTrue(any(t["title"] == "Review weekly lab reports" for t in tickets))

    def test_api_apply_action_endpoint(self):
        headers = {"Authorization": "Bearer test_auth_token_32_bytes_m6"}
        payload = {
            "action": "create_consultation",
            "params": {
                "patient_id": self.patient["id"],
                "scheduled_time": "2026-10-26 15:30",
                "duration_minutes": 15,
                "appointment_type": "med_review",
                "reason": "Metformin titration consult",
            }
        }
        res = self.client.post("/api/tools/execute_action", json=payload, headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))
        self.assertIn("appointment", data)


if __name__ == "__main__":
    unittest.main()
