#!/usr/bin/env python3
"""Real isolated native n8n; fictional loopback Sheets transport only.

No persistent profile, Google account, email or public tunnel is used. Code/IF
nodes and response expressions are untouched. Only Google transport destinations
and credential references are substituted with an ephemeral loopback fixture.
"""
from __future__ import annotations

import copy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
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
import threading
import time
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location("unsubscribe_builder",ROOT/"automation/n8n/build-unsubscribe.py")
builder=importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def free_port():
    with socket.socket() as handle:
        handle.bind(("127.0.0.1",0))
        return handle.getsockname()[1]


def post(url,payload,token=None):
    headers={"Content-Type":"application/json"}
    if token:
        headers["x-varino-unsub-key"]=token
    request=urllib.request.Request(url,data=json.dumps(payload).encode(),headers=headers)
    try:
        with urllib.request.urlopen(request,timeout=30) as response:
            return response.status,json.load(response)
    except urllib.error.HTTPError as error:
        try:
            result=json.load(error)
        except (ValueError,UnicodeError):
            result={}
        return error.code,result


def invoke(args,env):
    result=subprocess.run(args,env=env,capture_output=True,timeout=60)
    if result.returncode:
        # Never print credential import payloads, tokens or opaque fixture URLs.
        raise RuntimeError("Isolated native n8n CLI setup failed; production untouched")


def main():
    cli=shutil.which("n8n")
    if not cli:
        raise RuntimeError("Installed n8n CLI missing; do not install or use persistent profile")
    original=json.loads((ROOT/"automation/n8n/3-unsubscribe.template.json").read_text())
    assert original==builder.build_workflow("REPLACE_WITH_CRM_SHEET_ID"),"Template differs from reviewed builder"
    assert original["active"] is False
    previous=os.umask(0o077)
    try:
        with tempfile.TemporaryDirectory(prefix="varino-unsubscribe-native-") as directory:
            profile=Path(directory)
            token=secrets.token_urlsafe(48)
            credential_id="isolated-unsubscribe-"+secrets.token_hex(8)
            state={"rows":[],"reads":0,"writes":0,"bad_headers":False,"read_down":False,
                   "write_down":False,"ambiguous":False,"confirmation_down":False}

            class Fixture(BaseHTTPRequestHandler):
                def log_message(self,*_args):
                    pass

                def respond(self,status,payload):
                    encoded=json.dumps(payload).encode()
                    self.send_response(status)
                    self.send_header("Content-Type","application/json")
                    self.send_header("Content-Length",str(len(encoded)))
                    self.end_headers()
                    self.wfile.write(encoded)

                def authorized(self):
                    if self.headers.get("x-varino-unsub-key")==token:
                        return True
                    self.respond(401,{"error":"fixture_auth"})
                    return False

                def do_GET(self):
                    if not self.authorized():
                        return
                    assert self.path in ("/read","/confirm")
                    state["reads"]+=1
                    if state["read_down"] or (self.path=="/confirm" and state["confirmation_down"]):
                        return self.respond(503,{"error":"synthetic_read_failure"})
                    headers=["wrong_header"] if state["bad_headers"] else builder.HEADERS
                    self.respond(200,{"values":[headers]+state["rows"]})

                def do_POST(self):
                    if not self.authorized():
                        return
                    assert self.path=="/append"
                    size=int(self.headers.get("Content-Length","0"))
                    assert 0<size<2048
                    payload=json.loads(self.rfile.read(size))
                    assert set(payload)=={"values"} and len(payload["values"])==1
                    row=payload["values"][0]
                    assert len(row)==6 and row[0].endswith(".test") and row[1:3]==["email","baja"]
                    assert row[4]=="baja-confirmada-v1" and len(row[5])==64
                    state["writes"]+=1
                    if state["write_down"]:
                        return self.respond(503,{"error":"synthetic_write_failure"})
                    state["rows"].append(row)
                    if state["ambiguous"]:
                        return self.respond(503,{"error":"synthetic_lost_acknowledgement"})
                    self.respond(200,{"updates":{"updatedRows":1}})

            fixture=ThreadingHTTPServer(("127.0.0.1",0),Fixture)
            thread=threading.Thread(target=fixture.serve_forever,daemon=True)
            thread.start()
            graph=copy.deepcopy(original)
            credential={"httpHeaderAuth":{"id":credential_id,"name":"Disposable unsubscribe drill"}}
            routes={"Leer supresión actual":"read","Guardar supresión":"append","Releer supresión guardada":"confirm"}
            for node in graph["nodes"]:
                if node["type"]=="n8n-nodes-base.webhook":
                    node["credentials"]=credential
                elif node["type"]=="n8n-nodes-base.httpRequest":
                    node["parameters"]["url"]=f"http://127.0.0.1:{fixture.server_port}/{routes[node['name']]}"
                    node["parameters"]["authentication"]="genericCredentialType"
                    node["parameters"].pop("nodeCredentialType",None)
                    node["parameters"]["genericAuthType"]="httpHeaderAuth"
                    node["credentials"]=credential
            workflow_file=profile/"workflow.json"
            workflow_file.write_text(json.dumps(graph),encoding="utf-8")
            credentials_file=profile/"credentials.json"
            credentials_file.write_text(json.dumps([{"id":credential_id,"name":"Disposable unsubscribe drill",
              "type":"httpHeaderAuth","data":{"name":"x-varino-unsub-key","value":token}}]),encoding="utf-8")
            port=free_port()
            broker=free_port()
            while broker==port:
                broker=free_port()
            env={"PATH":os.environ.get("PATH","/usr/bin:/bin"),"N8N_USER_FOLDER":str(profile),
              "N8N_ENCRYPTION_KEY":secrets.token_urlsafe(48),"N8N_LISTEN_ADDRESS":"127.0.0.1",
              "N8N_HOST":"127.0.0.1","N8N_PORT":str(port),"N8N_PROTOCOL":"http",
              "N8N_RUNNERS_BROKER_LISTEN_ADDRESS":"127.0.0.1","N8N_RUNNERS_BROKER_PORT":str(broker),
              "N8N_DIAGNOSTICS_ENABLED":"false","N8N_PERSONALIZATION_ENABLED":"false",
              "N8N_VERSION_NOTIFICATIONS_ENABLED":"false","N8N_TEMPLATES_ENABLED":"false",
              "N8N_COMMUNITY_PACKAGES_ENABLED":"false","N8N_PUBLIC_API_DISABLED":"true",
              "N8N_LICENSE_AUTO_RENEW_ENABLED":"false","N8N_LOG_LEVEL":"error",
              # Installed n8n 2.40's no-save lifecycle uses soft deletion when
              # pruning is enabled. With all save settings disabled, turn it
              # off in this disposable no-history profile to delete in-flight
              # data immediately at completion (verified directly in SQLite).
              "EXECUTIONS_DATA_PRUNE":"false","EXECUTIONS_DATA_SAVE_ON_ERROR":"none",
              "EXECUTIONS_DATA_SAVE_ON_SUCCESS":"none","EXECUTIONS_DATA_SAVE_ON_PROGRESS":"false",
              "EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS":"false",
              "N8N_CONCURRENCY_PRODUCTION_LIMIT":"1","NO_PROXY":"127.0.0.1,localhost",
              "no_proxy":"127.0.0.1,localhost"}
            service=None
            try:
                invoke([cli,"import:workflow",f"--input={workflow_file}","--activeState=false"],env)
                invoke([cli,"import:credentials",f"--input={credentials_file}"],env)
                invoke([cli,"publish:workflow",f"--id={builder.WORKFLOW_ID}"],env)
                with (profile/"native.log").open("wb") as log:
                    service=subprocess.Popen([cli,"start"],env=env,stdout=log,stderr=log,start_new_session=True)
                    endpoint=f"http://127.0.0.1:{port}/webhook/unsub-sync"
                    for _ in range(200):
                        if service.poll() is not None:
                            raise RuntimeError("Isolated native n8n stopped")
                        try:
                            if post(endpoint,{})[0] in (401,403):
                                break
                        except (OSError,urllib.error.URLError):
                            pass
                        time.sleep(0.2)
                    else:
                        raise RuntimeError("Isolated authenticated unsubscribe webhook unavailable")
                    event=lambda address:{"email":address,"eventId":secrets.token_hex(32),"requestedAt":"2026-01-01T00:00:00.123Z"}
                    assert post(endpoint,{},"wrong-key")[0] in (401,403)
                    assert post(endpoint,{},token)[0]==400 and state["reads"]==state["writes"]==0
                    first=event("qa@agency.test")
                    status,result=post(endpoint,first,token)
                    assert status==200 and result=={"ok":True,"eventId":first["eventId"],"suppressed":True,"duplicate":False}
                    assert len(state["rows"])==state["writes"]==1
                    assert "qa@agency.test" not in json.dumps(result)
                    assert post(endpoint,first,token)[1]["duplicate"] is True
                    assert post(endpoint,event("QA@agency.test"),token)[1]["duplicate"] is True
                    assert state["writes"]==1
                    state["bad_headers"]=True
                    assert post(endpoint,event("bad-header@agency.test"),token)[0]==503
                    state["bad_headers"]=False
                    state["read_down"]=True
                    assert post(endpoint,event("read-down@agency.test"),token)[0]==503
                    state["read_down"]=False
                    assert state["writes"]==1
                    state["ambiguous"]=True
                    ambiguous=event("ambiguous@agency.test")
                    assert post(endpoint,ambiguous,token)[0]==200
                    state["ambiguous"]=False
                    assert len(state["rows"])==2 and state["writes"]==2
                    assert post(endpoint,ambiguous,token)[1]["duplicate"] is True and state["writes"]==2
                    state["write_down"]=True
                    assert post(endpoint,event("write-down@agency.test"),token)[0]==503
                    state["write_down"]=False
                    assert len(state["rows"])==2
                    state["confirmation_down"]=True
                    confirmation=event("confirmation-down@agency.test")
                    assert post(endpoint,confirmation,token)[0]==503 and len(state["rows"])==3
                    state["confirmation_down"]=False
                    assert post(endpoint,confirmation,token)[1]["duplicate"] is True
                    assert len(state["rows"])==3 and state["writes"]==4
                    # GET has no registered route, so an email link scanner cannot mutate it.
                    try:
                        urllib.request.urlopen(endpoint,timeout=10)
                        raise AssertionError("GET unexpectedly served a route")
                    except urllib.error.HTTPError as error:
                        assert error.code==404
                    assert len(state["rows"])==3
                    print("PASS: native Header Auth/POST validation, confirmed suppression, case-insensitive repeat, bad-header/read/write fail-closed, lost-append reconciliation, lost-confirmation replay, no GET mutation.",flush=True)
                    database=profile/".n8n/database.sqlite"
                    # RespondToWebhook completes HTTP before n8n finishes its
                    # execution lifecycle and removes the in-flight payload.
                    # Verify actual terminal cleanup, not immediate HTTP receipt.
                    count=None
                    for _ in range(100):
                        with sqlite3.connect(database.as_uri()+"?mode=ro",uri=True) as db:
                            count=db.execute("SELECT count(*) FROM execution_data").fetchone()[0]
                        if count==0:
                            break
                        time.sleep(0.1)
                    if count:
                        with sqlite3.connect(database.as_uri()+"?mode=ro",uri=True) as db:
                            statuses=db.execute("SELECT status,finished,count(*) FROM execution_entity GROUP BY status,finished").fetchall()
                            fields=[row[1] for row in db.execute("PRAGMA table_info(execution_data)")]
                            # Diagnostic flags only: never emit contacts or token values.
                            stored=db.execute("SELECT data,workflowData FROM execution_data").fetchall()
                        print(json.dumps({"residualRows":count,"statuses":statuses,"columns":fields,
                          "containsRecipient":any("@agency.test" in str(row) for row in stored),
                          "containsCredential":any(token in str(row) for row in stored)}),flush=True)
                    assert count==0,"Native n8n unexpectedly retained recipient/credential execution payloads"
                    print("PASS: native workflow retained zero execution payloads; no real Gmail or Google requests.",flush=True)
            finally:
                if service and service.poll() is None:
                    os.killpg(service.pid,signal.SIGTERM)
                    try:
                        service.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        os.killpg(service.pid,signal.SIGKILL)
                        service.wait(timeout=5)
                fixture.shutdown()
                fixture.server_close()
                thread.join(timeout=5)
        print("PASS: disposable profile and credentials removed; persistent n8n unchanged.")
    finally:
        os.umask(previous)


if __name__=="__main__":
    main()
