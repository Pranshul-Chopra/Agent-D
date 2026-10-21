"""
test_m2.py — Verification Test Suite for Milestone 2:
- Structured JSON Artifact editor & versioning
- Immutable version history snapshots
- Visual diff generator between versions
- Medical log entries with vitals metadata
- Log entry revision tracking (log_entry_versions)
- REST API verification for all M2 endpoints
"""

import os
import secrets
import config_db
import context_db
import crypto_utils
import main

def run_tests():
    print("=== STARTING MILESTONE 2 VERIFICATION SUITE ===")

    # 1. Initialize databases
    config_db.init_config_db()
    context_db.init_context_db()
    print("[OK] context.db and config.db initialized")

    # Set up auth token
    test_token = crypto_utils.generate_auth_token()
    os.environ["AGENT_D_AUTH_TOKEN"] = test_token

    app = main.create_app()
    client = app.test_client()
    headers = {
        "Authorization": f"Bearer {test_token}",
    }

    # 1. Create Patient
    print("\n--- 1. Patient & Initial Artifact ---")
    p_res = client.post(
        "/api/v1/patients",
        headers=headers,
        json={
            "display_name": "Marcus Aurelius",
            "date_of_birth": "1970-04-26",
            "gender": "Male",
            "blood_group": "A+",
            "phone": "+1-555-0199",
            "initial_summary": "Initial consultation for hypertension.",
        },
    )
    assert p_res.status_code == 201, f"Expected 201, got {p_res.status_code}: {p_res.get_json()}"
    p_data = p_res.get_json()["patient"]
    patient_id = p_data["id"]
    llm_alias = p_data["llm_alias"]
    print(f"[OK] Created patient: {p_data['display_name']} ({llm_alias})")

    # Verify initial artifact v1
    art_res = client.get(f"/api/v1/patients/{patient_id}/artifact", headers=headers)
    assert art_res.status_code == 200
    art = art_res.get_json()["artifact"]
    assert art["current_version"] == 1
    print(f"[OK] Initial artifact v1 verified: '{art['summary']}'")

    # 2. Update Artifact (creates v2)
    print("\n--- 2. Artifact Update & Version Snapshot ---")
    update_res = client.patch(
        f"/api/v1/patients/{patient_id}/artifact",
        headers=headers,
        json={
            "summary": "Hypertension well-managed. Added Lisinopril 10mg daily.",
            "active_issues": ["Essential Hypertension", "Mild Dyslipidemia"],
            "medications": ["Lisinopril 10mg QD", "Amlodipine 5mg QD"],
            "watch_for": ["Monitor dry cough", "Check BP log weekly"],
            "follow_ups": ["BP follow-up in 4 weeks"],
            "notes": "Patient reports good compliance and no dizziness.",
        },
    )
    assert update_res.status_code == 200
    updated_art = update_res.get_json()["artifact"]
    assert updated_art["current_version"] == 2
    assert "Essential Hypertension" in updated_art["active_issues"]
    assert len(updated_art["medications"]) == 2
    print(f"[OK] Artifact updated to version v{updated_art['current_version']}")

    # Verify version history has both v1 and v2
    v_res = client.get(f"/api/v1/patients/{patient_id}/artifact/versions", headers=headers)
    assert v_res.status_code == 200
    versions = v_res.get_json()["versions"]
    assert len(versions) >= 2
    assert versions[0]["version_num"] == 2
    assert versions[1]["version_num"] == 1
    print(f"[OK] Version history verified: {len(versions)} immutable snapshots on record")

    # 3. Visual Diff Generator
    print("\n--- 3. Visual Diff Generator ---")
    diff_res = client.get(
        f"/api/v1/patients/{patient_id}/artifact/diff?v1=1&v2=2",
        headers=headers,
    )
    assert diff_res.status_code == 200
    diff_data = diff_res.get_json()
    diff = diff_data["diff"]
    assert diff["has_changes"] is True
    assert diff["summary"]["changed"] is True

    # Check additions in active_issues
    issues_added = [x["item"] for x in diff["active_issues"] if x["status"] == "added"]
    assert "Essential Hypertension" in issues_added
    assert "Mild Dyslipidemia" in issues_added

    # Check additions in medications
    meds_added = [x["item"] for x in diff["medications"] if x["status"] == "added"]
    assert "Lisinopril 10mg QD" in meds_added
    print(f"[OK] Visual diff accurately identified changes: issues={issues_added}, meds={meds_added}")

    # 4. Version Restoration
    print("\n--- 4. Version Snapshot Restoration ---")
    restore_res = client.post(
        f"/api/v1/patients/{patient_id}/artifact/restore/1",
        headers=headers,
    )
    assert restore_res.status_code == 200
    restored_art = restore_res.get_json()["artifact"]
    assert restored_art["current_version"] == 3
    # Restored to v1 contents
    assert restored_art["active_issues"] == []
    print(f"[OK] Version 1 restored successfully as new snapshot v{restored_art['current_version']}")

    # 5. Medical Log Entries & Revision Tracking
    print("\n--- 5. Medical Log Entries & Revisions ---")
    log_res = client.post(
        f"/api/v1/patients/{patient_id}/logs",
        headers=headers,
        json={
            "entry_date": "2026-10-21",
            "entry_type": "vitals",
            "content": "In-clinic vitals recorded: BP 138/88 mmHg, resting heart rate 76 bpm. Afebrile.",
            "metadata": {
                "bp": "138/88",
                "hr": 76,
                "temp": "98.4",
                "o2": "99",
            },
        },
    )
    assert log_res.status_code == 201
    log = log_res.get_json()["log"]
    entry_id = log["id"]
    assert log["metadata"]["bp"] == "138/88"
    print(f"[OK] Created clinical observation with vitals metadata (ID: {entry_id})")

    # List logs
    list_logs_res = client.get(f"/api/v1/patients/{patient_id}/logs", headers=headers)
    assert list_logs_res.status_code == 200
    logs_list = list_logs_res.get_json()["logs"]
    assert len(logs_list) >= 1
    print(f"[OK] Listed medical logs: found {len(logs_list)} entry for patient")

    # Amend log entry (preserves previous in log_entry_versions)
    print("\n--- 6. Log Amendment & Immutable Revision Audit ---")
    amend_res = client.patch(
        f"/api/v1/logs/{entry_id}",
        headers=headers,
        json={
            "content": "Amended in-clinic vitals: BP 132/84 mmHg (re-check after 5 min rest), HR 72 bpm.",
            "edit_reason": "Re-measured blood pressure after patient rested",
            "metadata": {"bp": "132/84", "hr": 72, "temp": "98.4", "o2": "99"},
        },
    )
    assert amend_res.status_code == 200
    amended_log = amend_res.get_json()["log"]
    assert "132/84" in amended_log["content"]
    assert amended_log["versions_count"] == 1
    assert len(amended_log["versions"]) == 1
    assert "138/88" in amended_log["versions"][0]["previous_content"]
    assert amended_log["versions"][0]["edit_reason"] == "Re-measured blood pressure after patient rested"
    print(f"[OK] Log amendment verified! Previous content archived: '{amended_log['versions'][0]['previous_content'][:45]}...'")

    print("\n=== ALL MILESTONE 2 OBJECTIVES VERIFIED & PASSED! ===")

if __name__ == "__main__":
    run_tests()
