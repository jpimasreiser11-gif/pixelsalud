#!/usr/bin/env python3
"""Verify installed n8n's native hard-deletion timer in an owned temporary profile.

Two real CLI executions contain only a synthetic marker. While stopped, one is
marked soft-deleted/manual/running to reproduce the observed lifecycle metadata.
Only the installed native pruner removes it. No production profile is accepted,
no credential is decrypted, and no remote business transport is configured.
This is a pruning mechanism test, NOT a manual UI lifecycle or Google test.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

PREFIX = "varino-native-pruning-"


def free_port():
    with socket.socket() as candidate:
        candidate.bind(("127.0.0.1", 0))
        return candidate.getsockname()[1]


def isolated_environment(folder, port, broker):
    # Deliberately do not inherit HOME, tokens, proxies, or n8n profile settings.
    return {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "N8N_USER_FOLDER": str(folder),
        "N8N_ENCRYPTION_KEY": secrets.token_urlsafe(48),
        "N8N_HOST": "127.0.0.1", "N8N_LISTEN_ADDRESS": "127.0.0.1",
        "N8N_PORT": str(port), "N8N_PROTOCOL": "http",
        "N8N_RUNNERS_BROKER_LISTEN_ADDRESS": "127.0.0.1",
        "N8N_RUNNERS_BROKER_PORT": str(broker),
        "N8N_DIAGNOSTICS_ENABLED": "false", "N8N_PERSONALIZATION_ENABLED": "false",
        "N8N_VERSION_NOTIFICATIONS_ENABLED": "false", "N8N_TEMPLATES_ENABLED": "false",
        "N8N_COMMUNITY_PACKAGES_ENABLED": "false", "N8N_PUBLIC_API_DISABLED": "true",
        "N8N_LICENSE_AUTO_RENEW_ENABLED": "false", "N8N_LOG_LEVEL": "error",
        "EXECUTIONS_DATA_PRUNE": "false", "EXECUTIONS_DATA_MAX_AGE": "336",
        "EXECUTIONS_DATA_PRUNE_MAX_COUNT": "10000",
        # Accelerated timer is a TEST setting, not a production recommendation.
        "EXECUTIONS_DATA_PRUNE_HARD_DELETE_INTERVAL": "0.05",
        "EXECUTIONS_DATA_HARD_DELETE_BUFFER": "0",
        "EXECUTIONS_DATA_SAVE_ON_ERROR": "none", "EXECUTIONS_DATA_SAVE_ON_SUCCESS": "none",
        "EXECUTIONS_DATA_SAVE_ON_PROGRESS": "false",
        "EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS": "false",
        "N8N_CONCURRENCY_PRODUCTION_LIMIT": "1",
        "NO_PROXY": "127.0.0.1,localhost", "no_proxy": "127.0.0.1,localhost",
    }


def fixture_graph():
    return {
        "id": str(uuid.uuid4()), "name": "Synthetic native pruning verification",
        "active": False,
        "nodes": [
            {"id": str(uuid.uuid4()), "name": "Synthetic manual start",
             "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1,
             "position": [0, 0], "parameters": {}},
            {"id": str(uuid.uuid4()), "name": "Synthetic marker only",
             "type": "n8n-nodes-base.set", "typeVersion": 3.4,
             "position": [240, 0], "parameters": {"assignments": {"assignments": [
                 {"id": str(uuid.uuid4()), "name": "qa_marker", "type": "string",
                  "value": "synthetic-pruning-only"}]}, "options": {}}},
        ],
        "connections": {"Synthetic manual start": {"main": [[{
            "node": "Synthetic marker only", "type": "main", "index": 0}]]}},
        # Intentional synthetic retention so the timer has actual payloads to delete.
        "settings": {"executionOrder": "v1", "executionTimeout": 30,
                     "saveDataSuccessExecution": "all", "saveDataErrorExecution": "all",
                     "saveManualExecutions": True, "saveExecutionProgress": False},
    }


def stop_owned(process):
    if process is None or process.poll() is not None:
        return
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=15)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait(timeout=5)


def invoke(cli, arguments, env):
    process = subprocess.Popen([cli, *arguments], env=env, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, start_new_session=True)
    try:
        output, _ = process.communicate(timeout=60)
        if process.returncode:
            raise RuntimeError("Isolated native command failed; private output withheld")
        return output
    finally:
        stop_owned(process)


def metadata(database):
    with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=10) as db:
        executions = db.execute(
            'SELECT id,workflowId,mode,status,finished,deletedAt FROM execution_entity ORDER BY id'
        ).fetchall()
        payloads = db.execute('SELECT executionId FROM execution_data ORDER BY executionId').fetchall()
        workflows = db.execute(
            'SELECT id,active,nodes,connections,settings FROM workflow_entity ORDER BY id'
        ).fetchall()
        # Hash opaque ciphertext to detect mutation; do not decrypt or display it.
        credentials = db.execute('SELECT id,type,data FROM credentials_entity ORDER BY id').fetchall()
        return {
            "executions": executions, "payloads": payloads,
            "workflow_digest": hashlib.sha256(repr(workflows).encode()).hexdigest(),
            "credential_digest": hashlib.sha256(repr(credentials).encode()).hexdigest(),
            "workflow_count": len(workflows), "credential_count": len(credentials),
            "active_count": sum(bool(row[1]) for row in workflows),
            "integrity": db.execute('PRAGMA integrity_check').fetchone()[0],
        }


def seed_soft_deleted_diagnostic(database, workflow_id):
    # Never expose an option for a persistent profile, even for this fixture write.
    if database.name != "database.sqlite" or database.parent.name != ".n8n" or not database.parent.parent.name.startswith(PREFIX):
        raise ValueError("Refusing to seed anything outside the generated pruning fixture")
    before = metadata(database)
    if before["workflow_count"] != 1 or before["credential_count"] != 1 or before["active_count"] != 0 or len(before["executions"]) != 2 or len(before["payloads"]) != 2:
        raise ValueError("Synthetic native execution fixture does not match")
    if any(row[1:5] != (workflow_id, "cli", "success", 1) or row[5] is not None for row in before["executions"]):
        raise ValueError("Both initial native executions must be completed and un-deleted")
    target, retained = [row[0] for row in before["executions"]]
    with sqlite3.connect(database, timeout=10) as db:
        db.execute("UPDATE execution_entity SET mode='manual',status='running',finished=0,deletedAt=datetime('now','-2 hours') WHERE id=? AND workflowId=?", (target, workflow_id))
    return target, retained


def verify_assets(actual, baseline):
    for key in ("workflow_digest", "credential_digest", "workflow_count", "credential_count", "active_count", "integrity"):
        if actual[key] != baseline[key]:
            raise AssertionError("Native pruning changed unrelated assets or database integrity")


def wait_ready(service, port):
    deadline = time.monotonic() + 45
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    while time.monotonic() < deadline:
        if service.poll() is not None:
            raise RuntimeError("Isolated native service stopped; private output withheld")
        try:
            with opener.open(f"http://127.0.0.1:{port}/healthz/readiness", timeout=2) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.HTTPError):
            pass
        time.sleep(.2)
    raise RuntimeError("Isolated native readiness timeout")


def main():
    cli = shutil.which("n8n")
    if not cli:
        raise RuntimeError("Installed n8n required; persistent runtime untouched")
    previous = os.umask(0o077)
    try:
        with tempfile.TemporaryDirectory(prefix=PREFIX) as directory:
            folder = Path(directory).resolve()
            port, broker = free_port(), free_port()
            while broker == port:
                broker = free_port()
            env = isolated_environment(folder, port, broker)
            version = invoke(cli, ["--version"], env).decode().strip()
            if not re.fullmatch(r"\d+\.\d+\.\d+", version):
                raise RuntimeError("Native version did not match the expected format")
            graph = fixture_graph()
            workflow_file = folder / "synthetic-workflow.json"
            workflow_file.write_text(json.dumps(graph))
            invoke(cli, ["import:workflow", f"--input={workflow_file}", "--activeState=false"], env)
            credential_file = folder / "synthetic-credential.json"
            credential_file.write_text(json.dumps([{
                "id": str(uuid.uuid4()), "name": "Synthetic retained credential",
                "type": "httpHeaderAuth", "data": {"name": "X-QA-ONLY",
                    "value": secrets.token_urlsafe(32), "allowedHttpRequestDomains": "domains",
                    "allowedDomains": "127.0.0.1"}}]))
            invoke(cli, ["import:credentials", f"--input={credential_file}"], env)
            credential_file.unlink()  # Generated synthetic import only; never a real secret.
            for _ in range(2):
                invoke(cli, ["execute", f"--id={graph['id']}", "--rawOutput"], env)
            database = folder / ".n8n" / "database.sqlite"
            target, retained = seed_soft_deleted_diagnostic(database, graph["id"])
            baseline = metadata(database)
            assert baseline["integrity"] == "ok"
            assert baseline["active_count"] == 0
            report = {"n8n_version": version, "initial_real_cli_executions": 2, "phases": []}
            for name, enabled, buffer in [
                ("disabled_keeps_both", False, "0"),
                ("buffer_protects_recent_soft_delete", True, "3"),
                ("enabled_deletes_only_soft_deleted", True, "0"),
                ("restart_keeps_un_deleted_execution", True, "0"),
            ]:
                current_env = {**env, "EXECUTIONS_DATA_PRUNE": str(enabled).lower(),
                               "EXECUTIONS_DATA_HARD_DELETE_BUFFER": buffer}
                service = None
                with (folder / (name + ".log")).open("wb") as log:
                    try:
                        service = subprocess.Popen([cli, "start"], env=current_env, stdout=log,
                                                   stderr=log, start_new_session=True)
                        wait_ready(service, port)
                        started = time.monotonic()
                        if name == "enabled_deletes_only_soft_deleted":
                            while time.monotonic() - started < 30:
                                actual = metadata(database)
                                if len(actual["executions"]) == 1 and len(actual["payloads"]) == 1:
                                    break
                                if service.poll() is not None:
                                    raise RuntimeError("Isolated native pruner stopped")
                                time.sleep(.2)
                            else:
                                raise AssertionError("Native pruner did not remove the eligible fixture")
                        else:
                            # Observe more than two accelerated native timer periods.
                            while time.monotonic() - started < 7:
                                if service.poll() is not None:
                                    raise RuntimeError("Isolated native service stopped")
                                time.sleep(.2)
                            actual = metadata(database)
                        verify_assets(actual, baseline)
                        expected = [retained] if name in ("enabled_deletes_only_soft_deleted", "restart_keeps_un_deleted_execution") else [target, retained]
                        assert [row[0] for row in actual["executions"]] == expected, "Wrong native execution deletion scope"
                        assert [row[0] for row in actual["payloads"]] == expected, "Native payload deletion differs from metadata"
                        report["phases"].append({"name": name, "execution_entities": len(expected),
                                                "execution_payloads": len(expected), "pass": True})
                        print("PASS: " + name, flush=True)
                    finally:
                        stop_owned(service)
            print(json.dumps({**report, "workflows_unchanged": True,
                              "encrypted_credential_unchanged": True, "integrity": "ok",
                              "persistent_profile_used": False, "remote_business_calls": 0}), flush=True)
        assert not folder.exists(), "Owned synthetic profile was not removed"
        print("PASS: all owned native processes stopped and synthetic profile removed", flush=True)
    finally:
        os.umask(previous)


if __name__ == "__main__":
    main()
