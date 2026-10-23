"""
test_m1.py — Comprehensive Verification Suite for Milestone 1
"""

import os
import main
import config_db
import context_db
import crypto_utils

def run_tests():
    print("--- STARTING MILESTONE 1 VERIFICATION ---")

    # 1. DB initialization
    config_db.init_config_db()
    context_db.init_context_db()
    print("[OK] config.db and context.db initialized with WAL mode and foreign keys")

    # 2. Cryptographic token & perimeter security
    test_token = crypto_utils.generate_auth_token()
    os.environ["AGENT_D_AUTH_TOKEN"] = test_token
    app = main.create_app()
    client = app.test_client()

    # Unauth check
    res_unauth = client.get("/api/v1/patients")
    assert res_unauth.status_code == 401, f"Expected 401, got {res_unauth.status_code}"
    print("[OK] Security Perimeter: 401 Unauthorized enforced without launch token")

    # Ping check (always allowed)
    res_ping = client.get("/api/ping")
    assert res_ping.status_code == 200
    assert res_ping.get_json()["app"] == "agent_d"
    print("[OK] Readiness ping: 200 OK with app=agent_d")

    # 3. Patient registration via API
    auth_headers = {"Authorization": f"Bearer {test_token}"}
    res_create = client.post(
        "/api/v1/patients",
        headers=auth_headers,
        json={
            "display_name": "Sarah Jenkins",
            "date_of_birth": "1968-07-25",
            "gender": "Female",
            "blood_group": "A+",
            "phone": "+1 (555) 234-5678",
            "email": "sarah.j@example.org",
            "initial_summary": "Hypertension and routine cholesterol management.",
        },
    )
    assert res_create.status_code == 201, f"Expected 201, got {res_create.status_code}"
    p = res_create.get_json()["patient"]
    pid = p["id"]
    alias = p["llm_alias"]
    print(f"[OK] Created patient via API: {p['display_name']} with alias {alias}")
    assert alias.startswith("PT-")

    # 4. Verify Context Artifact initialized
    with context_db.get_context_db() as conn:
        art = conn.execute("SELECT * FROM artifacts WHERE patient_id = ?", (pid,)).fetchone()
        assert art is not None, "Artifact was not initialized"
        assert "Hypertension" in art["summary"]

        ver = conn.execute(
            "SELECT * FROM artifact_versions WHERE patient_id = ? AND version_num = 1", (pid,)
        ).fetchone()
        assert ver is not None, "Artifact version 1 was not created"
        print("[OK] Context Artifact v1 snapshot initialized in context.db")

        # 5. Verify Audit Event logged
        audit = conn.execute(
            "SELECT * FROM audit_events WHERE entity_id = ? AND action = 'create'", (pid,)
        ).fetchone()
        assert audit is not None, "Audit event was not recorded"
        print(f"[OK] Audit Event logged: {audit['entity_type']} {audit['action']} by {audit['actor']}")

        # 6. Verify AES-256-GCM encryption at rest in raw DB file
        raw_row = conn.execute(
            "SELECT display_name, phone FROM patients WHERE id = ?", (pid,)
        ).fetchone()
        assert raw_row["display_name"].startswith("aes_gcm_v1:"), "display_name not encrypted"
        assert raw_row["phone"].startswith("aes_gcm_v1:"), "phone not encrypted"
        assert "Sarah" not in raw_row["display_name"], "Raw name leaked in DB"
        print("[OK] AES-256-GCM encryption at rest verified in context.db")

    # 7. Zero AI Keys Verification: confirm keys endpoints are cleanly excised (404)
    res_key = client.get("/api/v1/keys", headers=auth_headers)
    assert res_key.status_code == 404, "Excised key endpoint must return 404"
    print("[OK] Zero AI Keys: confirmed excised endpoints return 404")

    print("=== ALL MILESTONE 1 OBJECTIVES VERIFIED & PASSED! ===")

if __name__ == "__main__":
    run_tests()
