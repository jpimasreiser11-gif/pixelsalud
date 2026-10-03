#!/usr/bin/env python3
"""Opt-in drill: real isolated n8n, synthetic loopback Sheets/Telegram transports.

No Google OAuth, real spreadsheet, Telegram account or persistent n8n is used.
The pinned workflow's validation, mapping, branching and responses are unmodified.
"""
from __future__ import annotations

import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit
import importlib.util

ROOT = Path(__file__).resolve().parent.parent
PINNED_EXPORT_HASH = "860533eb31f7b756d241e36014e822358890f88c1a9dd77b7fc28f05e9d2d05a"
HEADERS = ["fecha_creacion", "nombre", "email", "whatsapp", "empresa", "interes", "fuente", "pagina", "aviso_privacidad_leido", "mensaje", "etapa", "paso_nurture", "next_email_at", "ultimo_contacto_at", "lead_id", "conversation_id", "notas", "marketing_consent", "marketing_consent_at", "marketing_consent_source"]
spec = importlib.util.spec_from_file_location("isolated_helpers", ROOT / "scripts/test-document-jobs-n8n.py")
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)


def post(url, body, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["x-varino-lead-key"] = token
    request = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, {}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workflow", type=Path, required=True)
    args = parser.parse_args()
    if args.workflow.is_symlink() or not args.workflow.is_file():
        raise RuntimeError("A regular reviewed export is required")
    raw = args.workflow.read_bytes()
    if hashlib.sha256(raw).hexdigest() != PINNED_EXPORT_HASH:
        raise RuntimeError("Export changed; audit before repinning")
    workflow = json.loads(raw)
    allowed = {"webhook", "code", "if", "httpRequest", "respondToWebhook", "telegram"}
    if len(workflow["nodes"]) != 21 or any(node["type"] != "n8n-nodes-base." + node["type"].rsplit(".", 1)[-1] or node["type"].rsplit(".", 1)[-1] not in allowed for node in workflow["nodes"]):
        raise RuntimeError("Unexpected node inventory")
    http_nodes = [node for node in workflow["nodes"] if node["type"] == "n8n-nodes-base.httpRequest"]
    if len(http_nodes) != 3 or any(urlsplit(node["parameters"]["url"]).scheme != "https" or urlsplit(node["parameters"]["url"]).hostname != "sheets.googleapis.com" for node in http_nodes):
        raise RuntimeError("Unexpected original HTTP destination")
    webhook = next(node for node in workflow["nodes"] if node["type"] == "n8n-nodes-base.webhook")
    if webhook["parameters"].get("authentication") != "headerAuth":
        raise RuntimeError("Unauthenticated webhook rejected")
    n8n = shutil.which("n8n"); node_runtime = shutil.which("node")
    if not n8n or not node_runtime:
        raise RuntimeError("Installed runtimes required")
    previous_umask = os.umask(0o077)
    try:
        with tempfile.TemporaryDirectory(prefix="varino-inbound-n8n-drill-") as directory:
            profile = Path(directory)
            token = secrets.token_urlsafe(32); credential_id = secrets.token_hex(16)
            state = {"rows": [], "bad_headers": False, "bad_lookup": False, "ambiguous": False, "notifications": 0}

            class Fixture(BaseHTTPRequestHandler):
                def log_message(self, *_args):
                    pass

                def send_json(self, code, value):
                    raw_body = json.dumps(value).encode()
                    self.send_response(code); self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(raw_body))); self.end_headers(); self.wfile.write(raw_body)

                def authorized(self):
                    if self.headers.get("x-varino-lead-key") != token:
                        self.send_json(401, {}); return False
                    return True

                def do_GET(self):
                    if not self.authorized():
                        return
                    if self.path == "/headers":
                        self.send_json(200, {"values": [HEADERS[:-1] if state["bad_headers"] else HEADERS]})
                    elif self.path == "/ids":
                        self.send_json(503, {}) if state["bad_lookup"] else self.send_json(200, {"range": "Leads!O2:O", "values": [[row[14]] for row in state["rows"]]})
                    else:
                        self.send_json(404, {})

                def do_POST(self):
                    if not self.authorized():
                        return
                    length = int(self.headers.get("Content-Length", "0"))
                    if length > 12000:
                        self.send_json(413, {}); return
                    body = json.loads(self.rfile.read(length))
                    if self.path == "/append":
                        row = body["values"][0]
                        assert len(body["values"]) == 1 and len(row) == len(HEADERS)
                        assert row[2].endswith(".test") and row[3] == "" and row[8] == "sí"
                        assert row[14].startswith("L_") and len(row[14]) == 66
                        state["rows"].append(row)
                        self.send_json(503, {}) if state["ambiguous"] else self.send_json(200, {"updates": {"updatedRows": 1}})
                    elif self.path == "/notification":
                        text = str(body.get("text", ""))
                        assert "@" not in text and "Empresa ficticia" not in text
                        state["notifications"] += 1
                        # Simulate a failed noncritical notification, not real Telegram.
                        self.send_json(503, {})
                    else:
                        self.send_json(404, {})

            fixture = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
            thread = threading.Thread(target=fixture.serve_forever, daemon=True); thread.start()
            credential = {"httpHeaderAuth": {"id": credential_id, "name": "Isolated inbound drill"}}
            webhook["credentials"] = credential
            routes = {"Leer cabeceras CRM": "headers", "Leer IDs existentes": "ids", "Sheets append Leads": "append"}
            for node in http_nodes:
                node["parameters"]["url"] = f"http://127.0.0.1:{fixture.server_port}/{routes[node['name']]}"
                node["parameters"]["authentication"] = "genericCredentialType"
                node["parameters"].pop("nodeCredentialType", None)
                node["parameters"]["genericAuthType"] = "httpHeaderAuth"
                node["credentials"] = credential
            notification = next(node for node in workflow["nodes"] if node["type"] == "n8n-nodes-base.telegram")
            notification.update({"type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
                "credentials": credential, "parameters": {"method": "POST", "url": f"http://127.0.0.1:{fixture.server_port}/notification",
                    "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth", "sendBody": True,
                    "specifyBody": "json", "jsonBody": "={{ JSON.stringify({text:$json.text}) }}", "options": {}}})
            workflow["active"] = False
            workflow["settings"]["executionTimeout"] = 60
            workflow_file = profile / "workflow.json"; workflow_file.write_text(json.dumps(workflow), encoding="utf-8")
            credential_file = profile / "credential.json"
            credential_file.write_text(json.dumps([{"id": credential_id, "name": "Isolated inbound drill", "type": "httpHeaderAuth", "data": {"name": "x-varino-lead-key", "value": token}}]), encoding="utf-8")
            listen_port = helpers.port(); broker_port = helpers.port()
            while broker_port == listen_port:
                broker_port = helpers.port()
            env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "N8N_USER_FOLDER": str(profile), "N8N_ENCRYPTION_KEY": secrets.token_urlsafe(48),
                "N8N_LISTEN_ADDRESS": "127.0.0.1", "N8N_HOST": "127.0.0.1", "N8N_PORT": str(listen_port), "N8N_PROTOCOL": "http",
                "N8N_RUNNERS_BROKER_LISTEN_ADDRESS": "127.0.0.1", "N8N_RUNNERS_BROKER_PORT": str(broker_port),
                "N8N_DIAGNOSTICS_ENABLED": "false", "N8N_PERSONALIZATION_ENABLED": "false", "N8N_VERSION_NOTIFICATIONS_ENABLED": "false",
                "N8N_TEMPLATES_ENABLED": "false", "N8N_COMMUNITY_PACKAGES_ENABLED": "false", "N8N_PUBLIC_API_DISABLED": "true",
                "N8N_LICENSE_AUTO_RENEW_ENABLED": "false", "N8N_LOG_LEVEL": "error", "N8N_CONCURRENCY_PRODUCTION_LIMIT": "1",
                "NO_PROXY": "127.0.0.1,localhost", "no_proxy": "127.0.0.1,localhost"}
            try:
                helpers.invoke([n8n, "import:workflow", f"--input={workflow_file}", "--activeState=false"], env)
                helpers.invoke([n8n, "import:credentials", f"--input={credential_file}"], env)
                helpers.invoke([n8n, "publish:workflow", f"--id={workflow['id']}"], env)
                with (profile / "n8n.log").open("wb") as log:
                    service = subprocess.Popen([n8n, "start"], env=env, stdout=log, stderr=log, start_new_session=True)
                    try:
                        url = f"http://127.0.0.1:{listen_port}/webhook/lead"
                        for _ in range(200):
                            if service.poll() is not None:
                                raise RuntimeError("Isolated n8n stopped")
                            try:
                                status, _ = post(url, {})
                                if status in (401, 403):
                                    break
                            except (OSError, urllib.error.URLError):
                                pass
                            time.sleep(0.2)
                        else:
                            raise RuntimeError("Authenticated isolated webhook unavailable")
                        assert post(url, {}, "wrong-key")[0] in (401, 403)
                        assert post(url, {}, token)[0] == 400
                        drill_env = {"PATH": env["PATH"], "HOME": os.environ.get("HOME", ""), "VARINO_TEST_N8N_PORT": str(listen_port), "VARINO_TEST_N8N_TOKEN": token}
                        if os.environ.get("VARINO_TEST_SCREENSHOT"):
                            drill_env["VARINO_TEST_SCREENSHOT"] = os.environ["VARINO_TEST_SCREENSHOT"]
                        if os.environ.get("VARINO_TEST_CONTACT_SCREENSHOT"):
                            drill_env["VARINO_TEST_CONTACT_SCREENSHOT"] = os.environ["VARINO_TEST_CONTACT_SCREENSHOT"]
                        drilled = subprocess.run([node_runtime, str(ROOT / "scripts/test-inbound-runtime.mjs")], cwd=ROOT, env=drill_env, timeout=240)
                        if drilled.returncode != 0:
                            raise RuntimeError("Inbound runtime drill failed; no production claim")
                        assert len(state["rows"]) == 2  # HTTP fixture and real browser form.
                        assert all(row[17] == "no" and row[19] == "" and row[18] == "" for row in state["rows"])
                        row = state["rows"][0]
                        assert row[17] == "no" and row[19] == "" and row[18] == ""
                        duplicate = {"nombre": row[1], "email": row[2], "empresa": row[4], "whatsapp": "", "interes": row[5],
                            "fuente": row[6], "pagina": row[7], "privacy_acknowledged": True, "marketing_consent": True, "mensaje": row[9], "submissionId": row[14][2:]}
                        status, result = post(url, duplicate, token)
                        assert status == 200 and result["duplicate"] is True and len(state["rows"]) == 2
                        new = {**duplicate, "submissionId": secrets.token_hex(32)}
                        state["bad_headers"] = True; assert post(url, new, token)[0] == 503; state["bad_headers"] = False
                        state["bad_lookup"] = True; assert post(url, new, token)[0] == 503; state["bad_lookup"] = False
                        assert len(state["rows"]) == 2
                        state["ambiguous"] = True; assert post(url, new, token)[0] == 503; state["ambiguous"] = False
                        assert len(state["rows"]) == 3
                        assert post(url, new, token)[1]["duplicate"] is True and len(state["rows"]) == 3
                        print("PASS: real n8n auth, mapping, unverified opt-in NOT enrolled, duplicate branch, header/lookup fail-closed, ambiguous append reconciliation and notification failure isolation.", flush=True)
                    finally:
                        if service.poll() is None:
                            os.killpg(service.pid, signal.SIGTERM)
                            try:
                                service.wait(timeout=15)
                            except subprocess.TimeoutExpired:
                                os.killpg(service.pid, signal.SIGKILL); service.wait(timeout=5)
            finally:
                fixture.shutdown(); fixture.server_close(); thread.join(timeout=5)
            print("PASS: disposable profile and credentials removed; Google/Telegram and persistent n8n untouched.")
    finally:
        os.umask(previous_umask)


if __name__ == "__main__":
    main()
