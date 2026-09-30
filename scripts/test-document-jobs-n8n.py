#!/usr/bin/env python3
"""Opt-in integration drill: temporary n8n + Header Auth + real local Ollama.

Only the pinned, reviewed VARINO document export is accepted. It never changes
the persistent n8n instance, accepts external customers, or connects cloud apps.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

PINNED_EXPORT_HASH = "0546a66da0927c7e4f93f7c4d4522c627bfa7cbafbe7616f9627e0211979fabe"
ROOT = Path(__file__).resolve().parent.parent


def port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def invoke(command, env, timeout=60):
    done = subprocess.run(command, env=env, cwd=ROOT, capture_output=True, timeout=timeout)
    if done.returncode != 0:
        raise RuntimeError("Isolated command failed; no secrets or response bodies were logged")


def post(url, body, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["x-varino-document-key"] = token
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workflow", type=Path, required=True)
    args = parser.parse_args()
    if args.workflow.is_symlink() or not args.workflow.is_file():
        raise RuntimeError("A regular, reviewed workflow export is required")
    raw = args.workflow.read_bytes()
    if hashlib.sha256(raw).hexdigest() != PINNED_EXPORT_HASH:
        raise RuntimeError("Workflow differs from the reviewed pinned export; audit before repinning")
    workflow = json.loads(raw)
    http = [node for node in workflow["nodes"] if node["type"] == "n8n-nodes-base.httpRequest"]
    if len(http) != 1 or http[0]["parameters"]["url"] != "http://127.0.0.1:11434/api/chat":
        raise RuntimeError("Only one loopback Ollama request is allowed")
    webhook = next(node for node in workflow["nodes"] if node["type"] == "n8n-nodes-base.webhook")
    if webhook["parameters"].get("authentication") != "headerAuth":
        raise RuntimeError("Refusing an unauthenticated workflow")
    with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=3) as response:
        models = json.load(response)
    if not any(model.get("name") == "qwen3.6:27b" for model in models.get("models", [])):
        raise RuntimeError("Required local Qwen model is unavailable")
    n8n = shutil.which("n8n")
    node = shutil.which("node")
    if not n8n or not node:
        raise RuntimeError("Installed n8n and Node runtimes are required")
    previous_umask = os.umask(0o077)
    try:
        with tempfile.TemporaryDirectory(prefix="varino-document-http-drill-") as directory:
            profile = Path(directory)
            listen_port = port()
            broker_port = port()
            while broker_port == listen_port:
                broker_port = port()
            token = secrets.token_urlsafe(32)
            credential_id = secrets.token_hex(16)
            webhook["credentials"] = {"httpHeaderAuth": {"id": credential_id, "name": "Isolated document drill"}}
            # Do not relax any node's validation or save generated execution data.
            workflow["active"] = False
            workflow_file = profile / "workflow.json"
            workflow_file.write_text(json.dumps(workflow), encoding="utf-8")
            credential_file = profile / "credential.json"
            credential_file.write_text(json.dumps([{"id": credential_id, "name": "Isolated document drill", "type": "httpHeaderAuth", "data": {"name": "x-varino-document-key", "value": token}}]), encoding="utf-8")
            env = {
                "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                "N8N_USER_FOLDER": str(profile), "N8N_ENCRYPTION_KEY": secrets.token_urlsafe(48),
                "N8N_LISTEN_ADDRESS": "127.0.0.1", "N8N_HOST": "127.0.0.1", "N8N_PORT": str(listen_port), "N8N_PROTOCOL": "http",
                "N8N_RUNNERS_BROKER_LISTEN_ADDRESS": "127.0.0.1", "N8N_RUNNERS_BROKER_PORT": str(broker_port),
                "N8N_DIAGNOSTICS_ENABLED": "false", "N8N_PERSONALIZATION_ENABLED": "false", "N8N_VERSION_NOTIFICATIONS_ENABLED": "false",
                "N8N_TEMPLATES_ENABLED": "false", "N8N_COMMUNITY_PACKAGES_ENABLED": "false", "N8N_PUBLIC_API_DISABLED": "true",
                "N8N_LICENSE_AUTO_RENEW_ENABLED": "false", "N8N_LOG_LEVEL": "error",
                "NO_PROXY": "127.0.0.1,localhost", "no_proxy": "127.0.0.1,localhost",
            }
            invoke([n8n, "import:workflow", f"--input={workflow_file}", "--activeState=false"], env)
            invoke([n8n, "import:credentials", f"--input={credential_file}"], env)
            # Activation is only in this disposable loopback profile, not production.
            invoke([n8n, "publish:workflow", f"--id={workflow['id']}"], env)
            with (profile / "n8n.log").open("wb") as log:
                service = subprocess.Popen([n8n, "start"], env=env, stdout=log, stderr=log, start_new_session=True)
                try:
                    base = f"http://127.0.0.1:{listen_port}"
                    for _ in range(150):
                        if service.poll() is not None:
                            raise RuntimeError("Isolated n8n stopped before readiness")
                        try:
                            with urllib.request.urlopen(base + "/healthz", timeout=1) as health:
                                if health.status == 200:
                                    break
                        except (OSError, urllib.error.URLError):
                            pass
                        time.sleep(0.2)
                    else:
                        raise RuntimeError("Isolated n8n startup timed out")
                    url = base + "/webhook/document-pack-draft"
                    # /healthz can be ready before published webhooks are registered.
                    for _ in range(100):
                        auth_status = post(url, {"brief": "A fictional process for internal review."})
                        if auth_status != 404:
                            break
                        time.sleep(0.2)
                    if auth_status not in (401, 403):
                        raise RuntimeError(f"Isolated webhook readiness/authentication failed: HTTP {auth_status}")
                    assert post(url, {"brief": "A fictional process for internal review."}, "wrong-key") in (401, 403)
                    assert post(url, {"brief": "Contact maria@example.test for the fictional process."}, token) == 400
                    print("PASS: real isolated n8n webhook rejects missing/wrong Header Auth and synthetic PII.", flush=True)
                    drill_env = {"PATH": env["PATH"], "HOME": os.environ.get("HOME", ""), "VARINO_TEST_N8N_PORT": str(listen_port), "VARINO_TEST_N8N_TOKEN": token}
                    if os.environ.get("VARINO_TEST_SCREENSHOT"):
                        drill_env["VARINO_TEST_SCREENSHOT"] = os.environ["VARINO_TEST_SCREENSHOT"]
                    drilled = subprocess.run([node, str(ROOT / "scripts/test-document-jobs-runtime.mjs")], cwd=ROOT, env=drill_env, timeout=420)
                    if drilled.returncode != 0:
                        raise RuntimeError("Queue → n8n → Qwen drill failed; no production delivery claimed")
                finally:
                    if service.poll() is None:
                        os.killpg(service.pid, signal.SIGTERM)
                        try:
                            service.wait(timeout=15)
                        except subprocess.TimeoutExpired:
                            os.killpg(service.pid, signal.SIGKILL)
                            service.wait(timeout=5)
            print("PASS: disposable credentials, database and profile removed; persistent n8n untouched.")
    finally:
        os.umask(previous_umask)


if __name__ == "__main__":
    main()
