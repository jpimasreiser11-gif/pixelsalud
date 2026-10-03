#!/usr/bin/env python3
"""Actual native mail gate, isolated upstream context and fictitious sender only.

Does not test real consent, Google/Gmail, or persistent complete workflows.
Code/IF/body expressions and Header Auth of the new gate remain unchanged.
"""
from __future__ import annotations
import base64
import copy
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
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
import uuid

ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location("mail_gate_contract",ROOT/"tests/backups/test_durable_mail_gate.py")
contract=importlib.util.module_from_spec(spec); spec.loader.exec_module(contract)
builder=contract.builder

def free_port():
    with socket.socket() as candidate:
        candidate.bind(("127.0.0.1",0)); return candidate.getsockname()[1]

def main():
    cli=shutil.which("n8n")
    if not cli: raise RuntimeError("Installed n8n unavailable; persistent runtime untouched")
    previous=os.umask(0o077)
    try:
        with tempfile.TemporaryDirectory(prefix="varino-native-mail-gate-") as directory:
            folder=Path(directory); token=secrets.token_urlsafe(48); credential=str(uuid.uuid4())
            state={"scenario":"clear","checks":[],"sends":[],"alerts":0,"redirects":0}
            class Fixture(BaseHTTPRequestHandler):
                def log_message(self,*args): pass
                def reply(self,code,body):
                    data=json.dumps(body).encode(); self.send_response(code)
                    self.send_header("Content-Type","application/json"); self.send_header("Content-Length",str(len(data))); self.end_headers()
                    try: self.wfile.write(data)
                    except (BrokenPipeError,ConnectionResetError): pass
                def do_GET(self):
                    state["redirects"]+=1; self.reply(200,{"suppressed":False})
                def do_POST(self):
                    size=int(self.headers.get("Content-Length","0")); assert 0<size<300000
                    data=json.loads(self.rfile.read(size))
                    if self.path=="/check":
                        if self.headers.get("Authorization")!="Bearer "+token: return self.reply(401,{"error":"fixture_auth"})
                        assert set(data)=={"email"} and data["email"].endswith(".test")
                        state["checks"].append(data["email"])
                        scenario=state["scenario"]
                        if scenario=="redirect":
                            self.send_response(302); self.send_header("Location","/must-not-follow"); self.send_header("Content-Length","0"); self.end_headers(); return
                        if scenario=="unavailable": return self.reply(503,{"suppressed":False})
                        if scenario=="malformed": return self.reply(200,{"suppressed":"false"})
                        if scenario=="extra": return self.reply(200,{"suppressed":False,"extra":True})
                        if scenario=="timeout":
                            time.sleep(8.5); return self.reply(200,{"suppressed":False})
                        self.reply(200,{"suppressed":scenario=="suppressed" or (scenario=="mixed" and data["email"]=="blocked@example.test")}); return
                    if self.path=="/send":
                        assert set(data)=={"raw"}
                        raw=base64.urlsafe_b64decode(data["raw"]+"="*(-len(data["raw"])%4)).decode()
                        to=[line[4:] for line in raw.split("\r\n\r\n",1)[0].split("\r\n") if line.startswith("To: ")]
                        assert len(to)==1 and to[0].endswith(".test")
                        state["sends"].extend(to); self.reply(200,{"id":"fictitious-send"}); return
                    if self.path=="/alert":
                        state["alerts"]+=1; self.reply(200,{"ok":True}); return
                    state["redirects"]+=1; self.reply(400,{"error":"unexpected_path"})
            server=ThreadingHTTPServer(("127.0.0.1",0),Fixture)
            thread=threading.Thread(target=server.serve_forever,daemon=True); thread.start()
            base=f"http://127.0.0.1:{server.server_port}"
            port,broker=free_port(),free_port()
            while broker==port: broker=free_port()
            env={"PATH":os.environ.get("PATH","/usr/bin:/bin"),"N8N_USER_FOLDER":str(folder),"N8N_ENCRYPTION_KEY":secrets.token_urlsafe(48),
                "N8N_LISTEN_ADDRESS":"127.0.0.1","N8N_HOST":"127.0.0.1","N8N_PORT":str(port),"N8N_PROTOCOL":"http",
                "N8N_RUNNERS_BROKER_LISTEN_ADDRESS":"127.0.0.1","N8N_RUNNERS_BROKER_PORT":str(broker),
                "N8N_DIAGNOSTICS_ENABLED":"false","N8N_PERSONALIZATION_ENABLED":"false","N8N_VERSION_NOTIFICATIONS_ENABLED":"false",
                "N8N_TEMPLATES_ENABLED":"false","N8N_COMMUNITY_PACKAGES_ENABLED":"false","N8N_PUBLIC_API_DISABLED":"true",
                "N8N_LICENSE_AUTO_RENEW_ENABLED":"false","N8N_LOG_LEVEL":"error","EXECUTIONS_DATA_PRUNE":"false",
                "EXECUTIONS_DATA_SAVE_ON_ERROR":"none","EXECUTIONS_DATA_SAVE_ON_SUCCESS":"none","EXECUTIONS_DATA_SAVE_ON_PROGRESS":"false",
                "EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS":"false","N8N_CONCURRENCY_PRODUCTION_LIMIT":"1","NO_PROXY":"127.0.0.1,localhost","no_proxy":"127.0.0.1,localhost"}
            def invoke(command):
                result=subprocess.run(command,env=env,capture_output=True,timeout=60)
                if result.returncode: raise RuntimeError("Isolated n8n preparation failed; private output withheld")
            secret_file=folder/"credentials.json"
            secret_file.write_text(json.dumps([{"id":credential,"name":"Isolated mail check","type":"httpHeaderAuth",
                "data":{"name":"Authorization","value":"Bearer "+token,"allowedHttpRequestDomains":"domains","allowedDomains":"127.0.0.1"}}]))
            service=None
            try:
                for kind in builder.SPECS:
                    original=contract.fixture(kind)
                    graph=builder.patch_workflow(original,kind,credential_id=credential)
                    graph["name"]="Isolated durable mail guard · "+kind
                    nodes={node["name"]:node for node in graph["nodes"]}
                    sender,alert,row_key,table=builder.SPECS[kind]
                    # Only the prior approved context and remote transports are fixtures.
                    # Never replace $execution.mode or modify the new guard code/IF/body.
                    nodes["Autorizar envío actual"]["parameters"]={"jsCode":
                        "const items=$input.first().json.body.items; return items.map(ctx=>({json:{...ctx,dispatchDeadline:ctx.expired?Date.now()-1:Date.now()+30000},pairedItem:{item:0}}));"}
                    nodes[builder.UPSTREAM].update(type="n8n-nodes-base.if",typeVersion=2.2,
                        parameters=copy.deepcopy(nodes[builder.GATE]["parameters"]))
                    nodes[builder.UPSTREAM]["parameters"]["conditions"]["conditions"][0]["leftValue"]="={{ $json.dispatchAuthorized === true }}"
                    nodes[builder.CHECK]["parameters"]["url"]=base+"/check"
                    nodes[sender]["parameters"].update(url=base+"/send",authentication="none",sendBody=True,specifyBody="json",options={"timeout":5000})
                    nodes[sender].pop("credentials",None)
                    nodes[alert].update(type="n8n-nodes-base.httpRequest",typeVersion=4.2,parameters={"method":"POST","url":base+"/alert",
                        "authentication":"none","sendBody":True,"specifyBody":"json","jsonBody":"={{ JSON.stringify({text:$json.text||'fixture'}) }}","options":{"timeout":5000}})
                    webhook={"id":str(uuid.uuid4()),"name":"Isolated approved-context trigger","type":"n8n-nodes-base.webhook","typeVersion":2,
                        "position":[-200,0],"webhookId":str(uuid.uuid4()),"parameters":{"httpMethod":"POST","path":"mail-gate-"+kind,
                        "authentication":"headerAuth","responseMode":"lastNode","options":{}},"credentials":{"httpHeaderAuth":{"id":credential,"name":"Isolated mail check"}}}
                    graph["nodes"].append(webhook)
                    graph["connections"][webhook["name"]]={"main":[[{"node":"Autorizar envío actual","type":"main","index":0}]]}
                    graph["connections"]["Autorizar envío actual"]={"main":[[{"node":builder.UPSTREAM,"type":"main","index":0}]]}
                    path=folder/(kind+".json"); path.write_text(json.dumps(graph))
                    assert all(base in n["parameters"]["url"] for n in graph["nodes"] if n["type"]=="n8n-nodes-base.httpRequest")
                    invoke([cli,"import:workflow",f"--input={path}","--activeState=false"])
                    invoke([cli,"publish:workflow",f"--id={graph['id']}"])
                invoke([cli,"import:credentials",f"--input={secret_file}"])
                with (folder/"native.log").open("wb") as log:
                    service=subprocess.Popen([cli,"start"],env=env,stdout=log,stderr=log,start_new_session=True)
                    api=f"http://127.0.0.1:{port}"
                    for _ in range(200):
                        if service.poll() is not None: raise RuntimeError("Isolated n8n stopped")
                        try:
                            request=urllib.request.Request(api+"/webhook/mail-gate-nurture",data=b'{}',headers={"Content-Type":"application/json"})
                            urllib.request.urlopen(request,timeout=2)
                        except urllib.error.HTTPError as error:
                            if error.code in (401,403): break
                        except OSError: pass
                        time.sleep(.2)
                    else: raise RuntimeError("Isolated webhook unavailable")
                    def context(kind,email="clear@example.test",raw_to=None,extra="",expired=False):
                        _,_,row_key,table=builder.SPECS[kind]
                        raw="From: QA <agency@example.test>\r\nTo: "+(raw_to or email)+"\r\n"+extra+"Subject: QA\r\n\r\nSynthetic only"
                        return {"raw":base64.urlsafe_b64encode(raw.encode()).decode().rstrip("="),row_key:["","",email],"A1":table+"!A2","dispatchAuthorized":True,"expired":expired}
                    def call(kind,items):
                        request=urllib.request.Request(api+"/webhook/mail-gate-"+kind,data=json.dumps({"items":items}).encode(),
                            headers={"Content-Type":"application/json","Authorization":"Bearer "+token})
                        try:
                            with urllib.request.urlopen(request,timeout=30) as response: response.read()
                        except urllib.error.HTTPError as error: error.read()
                    for kind in builder.SPECS:
                        for scenario in ["clear","suppressed","unavailable","malformed","extra","redirect","timeout","mixed"]:
                            state.update(scenario=scenario,checks=[],sends=[],alerts=0,redirects=0)
                            items=[context(kind,"blocked@example.test"),context(kind)] if scenario=="mixed" else [context(kind)]
                            call(kind,items)
                            assert state["sends"]==(["clear@example.test"] if scenario in ("clear","mixed") else []),"Wrong native dispatch decision"
                            assert len(state["checks"])==len(items),"Native item linkage/check count differs"
                            assert state["redirects"]==0,"Native HTTP followed a credential-bearing redirect"
                            assert state["alerts"]==(0 if scenario=="clear" else 1),"Blocked check was not routed for review"
                        invalid_envelopes=[context(kind,expired=True),context(kind,raw_to="other@example.test"),context(kind,extra="Bcc: other@example.test\r\n")]
                        invalid_envelopes.extend(context(kind,email=email) for email in ["a,b@example.test","group:a;@example.test","a(comment)@example.test","a@exa,mple.test",".a@example.test","a..b@example.test"])
                        for invalid in invalid_envelopes:
                            state.update(scenario="clear",checks=[],sends=[],alerts=0,redirects=0)
                            call(kind,[invalid]); assert not state["checks"] and not state["sends"],"Invalid envelope reached private API/sender"
                    print("PASS: both native guard variants; clear only, current opposition, 503, malformed/extra response, 302 without redirect, timeout, mixed-item pairing, stale permission, hidden/wrong recipients, address lists/groups/comments and invalid dot syntax. Fictitious sender only.",flush=True)
                    database=folder/".n8n/database.sqlite"
                    count=None
                    for _ in range(100):
                        with sqlite3.connect(database.as_uri()+"?mode=ro",uri=True) as db: count=db.execute("SELECT count(*) FROM execution_data").fetchone()[0]
                        if count==0: break
                        time.sleep(.1)
                    assert count==0,"Isolated execution payloads retained"
                    print("PASS: isolated n8n retained zero execution payloads; no real accounts or persistent profile used.",flush=True)
            finally:
                if service and service.poll() is None:
                    os.killpg(service.pid,signal.SIGTERM)
                    try: service.wait(timeout=15)
                    except subprocess.TimeoutExpired: os.killpg(service.pid,signal.SIGKILL); service.wait(timeout=5)
                server.shutdown(); server.server_close(); thread.join(timeout=5)
        print("PASS: isolated credentials/profile removed and native process stopped; production untouched.",flush=True)
    finally: os.umask(previous)

if __name__=="__main__": main()
