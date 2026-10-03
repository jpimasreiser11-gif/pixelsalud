#!/usr/bin/env python3
"""Opt-in native n8n drill for reviewed public demos, in a disposable profile.

No production profile, OAuth, customer data, public webhook or external node.
The browser preview is not execution; this script checks the actual downloads.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import sqlite3
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
CASES = [
    ("clinica-intake.n8n.json", "4b2684d8d4b76c9f0b6cf48cf535f7de408457ff3dcb7298836d01bcde0743fc", "REVIEW_REQUIRED", "pending_human_review", "category", "solicitud_cita"),
    ("leads-seguimiento.n8n.json", "9856b890c21ccaf7c36762973a0b62fb35b556a2d55c87d21b072f9e464b5085", "COMMERCIAL_APPROVAL_REQUIRED", "pending_commercial_review", "priority", "review_high"),
    ("operaciones-bandeja.n8n.json", "49e1b79b9901a100facd259ba8b74be71be867c84bfa654f2bfcd862d230785c", "PROCESS_OWNER_REVIEW_REQUIRED", "pending_owner_review", "route", "operations_queue"),
]


def port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def invoke(command, env, allow_failure=False):
    process = subprocess.Popen(command, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
    try:
        output, errors = process.communicate(timeout=60)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.communicate(timeout=5)
        raise RuntimeError("Disposable n8n command timed out")
    if process.returncode != 0 and not allow_failure:
        raise RuntimeError(f"Native command failed: {command[1]}: {(errors or output)[-1200:]}")
    return output + (errors if allow_failure else "")


def execution(output):
    # n8n may log initialization warnings before its --rawOutput JSON.
    for offset, char in enumerate(output):
        if char != "{":
            continue
        try:
            result, _ = json.JSONDecoder().raw_decode(output[offset:])
        except json.JSONDecodeError:
            continue
        if isinstance(result, dict) and isinstance(result.get("data", {}).get("resultData"), dict):
            return result
    raise RuntimeError("Native n8n execution result absent")


def main():
    n8n = shutil.which("n8n")
    if not n8n:
        raise RuntimeError("Install/verify n8n separately; this drill installs nothing")
    reviewed = []
    for filename, digest, *expected in CASES:
        source = ROOT / "public" / "demos" / filename
        if source.is_symlink() or not source.is_file():
            raise RuntimeError("Regular reviewed export required")
        raw = source.read_bytes()
        if hashlib.sha256(raw).hexdigest() != digest:
            raise RuntimeError(f"Audit before repinning changed export: {filename}")
        flow = json.loads(raw)
        if flow["active"] is not False or len(flow["nodes"]) != 4 or "credentials" in flow:
            raise RuntimeError("Unexpected public demo inventory")
        for node, node_type in zip(flow["nodes"], ["manualTrigger", "set", "code", "set"]):
            if node["type"] != f"n8n-nodes-base.{node_type}" or "credentials" in node or not node.get("notes"):
                raise RuntimeError("Unexpected node or absent documentation")
        reviewed.append((flow, expected))

    old_umask = os.umask(0o077)
    try:
        with tempfile.TemporaryDirectory(prefix="varino-public-demos-n8n-") as directory:
            profile = Path(directory)
            ports = [port(), port()]
            while ports[0] == ports[1]:
                ports[1] = port()
            env = {
                "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                "N8N_USER_FOLDER": str(profile), "N8N_ENCRYPTION_KEY": secrets.token_urlsafe(48),
                "N8N_LISTEN_ADDRESS": "127.0.0.1", "N8N_HOST": "127.0.0.1", "N8N_PORT": str(ports[0]), "N8N_PROTOCOL": "http",
                "N8N_RUNNERS_BROKER_LISTEN_ADDRESS": "127.0.0.1", "N8N_RUNNERS_BROKER_PORT": str(ports[1]),
                "N8N_DIAGNOSTICS_ENABLED": "false", "N8N_PERSONALIZATION_ENABLED": "false", "N8N_VERSION_NOTIFICATIONS_ENABLED": "false",
                "N8N_TEMPLATES_ENABLED": "false", "N8N_COMMUNITY_PACKAGES_ENABLED": "false", "N8N_PUBLIC_API_DISABLED": "true",
                # execute --rawOutput still uses logger.info in n8n 2.40.7.
                # Capture locally; print only the verified synthetic summary.
                "N8N_LICENSE_AUTO_RENEW_ENABLED": "false", "N8N_LOG_LEVEL": "info",
                "EXECUTIONS_DATA_SAVE_ON_SUCCESS": "none", "EXECUTIONS_DATA_SAVE_ON_ERROR": "none", "EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS": "false",
            }
            version = invoke([n8n, "--version"], env).strip()
            if version != "2.40.7":
                raise RuntimeError("Runtime changed; review native compatibility before rerunning")
            bundle = profile / "reviewed-demos.json"
            bundle.write_text(json.dumps([flow for flow, _ in reviewed]), encoding="utf8")
            invoke([n8n, "import:workflow", f"--input={bundle}", "--activeState=false"], env)
            db = profile / ".n8n" / "database.sqlite"
            with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as connection:
                assert connection.execute("SELECT COUNT(*) FROM workflow_entity").fetchone()[0] == 3
                assert connection.execute("SELECT COUNT(*) FROM workflow_entity WHERE active=1").fetchone()[0] == 0
                assert connection.execute("SELECT COUNT(*) FROM credentials_entity").fetchone()[0] == 0
            for flow, expected in reviewed:
                data = execution(invoke([n8n, "execute", f"--id={flow['id']}", "--rawOutput"], env))
                results = data["data"]["resultData"]
                assert not results.get("error"), "Native validation failed"
                assert set(results["runData"]) == {node["name"] for node in flow["nodes"]}
                last = results["runData"][flow["nodes"][-1]["name"]]
                items = last[0]["data"]["main"][0]
                assert len(items) == 1
                output = items[0]["json"]
                gate, status, field, value = expected
                assert output["gate"] == gate and output["status"] == status
                assert output[field] == value and output["externalActionsAllowed"] is False
                print(f"PASS native n8n {version}: {flow['id']} — 4 nodes, 1 synthetic item, {gate}")
            for (flow, _), invalid in zip(reviewed, [("channel", "system", "Canal no permitido"), ("need", "", "Necesidad obligatoria"), ("source", "ftp", "Origen no permitido")]):
                # Only synthetic input changes, never node code or connections.
                candidate = json.loads(json.dumps(flow))
                field, value, message = invalid
                assignments = candidate["nodes"][1]["parameters"]["assignments"]["assignments"]
                next(item for item in assignments if item["name"] == field)["value"] = value
                bundle.write_text(json.dumps(candidate), encoding="utf8")
                invoke([n8n, "import:workflow", f"--input={bundle}", "--activeState=false"], env)
                data = execution(invoke([n8n, "execute", f"--id={candidate['id']}", "--rawOutput"], env, allow_failure=True))
                results = data["data"]["resultData"]
                assert message in results.get("error", {}).get("message", ""), "Invalid input was not rejected"
                assert candidate["nodes"][-1]["name"] not in results.get("runData", {}), "Invalid input reached human gate"
                print(f"PASS rejected: {candidate['id']} — {field}, no final item")
            with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as connection:
                assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
                assert connection.execute("SELECT COUNT(*) FROM workflow_entity WHERE active=1").fetchone()[0] == 0
                assert connection.execute("SELECT COUNT(*) FROM credentials_entity").fetchone()[0] == 0
    finally:
        os.umask(old_umask)
    print("PASS: disposable profile removed; no production n8n, OAuth or customer data used. This is not production integration.")


if __name__ == "__main__":
    main()
