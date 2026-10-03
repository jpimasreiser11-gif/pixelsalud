#!/usr/bin/env python3
"""Reviewed complete mail graphs + durable guard, native schedules/restart only.

Uses pinned private source exports and reviewed test helpers, never live n8n,
Google, Gmail, Telegram, secrets or the private CRM configuration. Remote
transports/authentication are fixtures; unchanged Code/IF and native scheduling,
item pairing and read-only operational witness are exercised in a temporary DB.
"""
from __future__ import annotations
import argparse
import ast
from collections import Counter
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import types

ROOT = Path(__file__).resolve().parent.parent
PINNED = {
    "tools/execution_guard.py": "20850d687e716d275aaf113374d9eb492544f8fc1028746c47cd9fc54bd6b12a",
    "workflows/test_mail_scheduled_n8n_e2e.py": "e8cc890920c1993ad311524ebb843cc64a8828ec043079b1e3289b2e4fac6528",
    "workflows/test_mail_batch_n8n_e2e.py": "0c45e8a58228b5969b0283a1252f13045e1c79de379e1356b8fff6eaf0a3086d",
    "workflows/varcrm.py": "9a675abcf2879036d98602b8d6e87e17c30818acda71ee7d781d9a26e743746a",
    "workflows/5-nurture-emails.json": "6ff81a5ab5ff602e5dd41e0b7ac92f110bcb5148dbecaa1b279155c65921ee0d",
    "workflows/11-followup-prospectos.json": "d2ca8d3c53a93efb9cadb30b5d025abeec8581da575f04064ce943a9b4a79643",
}


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def reviewed_fixture_module(path, schemas):
    # Execute only reviewed fixture definitions, stdlib imports and FLOWS.
    # In particular, do not import varcrm (which opens the private config) or
    # the chat/inference helper. No credentials/config are needed for this test.
    parsed = ast.parse(path.read_text(encoding="utf8"), filename=str(path))
    definitions = {"rows", "Fixtures", "Handler", "fixture_graph", "check_calls"}
    imports = {"__future__", "collections", "http.server", "pathlib", "urllib.parse"}
    body = []
    for node in parsed.body:
        if isinstance(node, ast.Import):
            if all(item.name in {"base64", "copy", "json", "re"} for item in node.names):
                body.append(node)
        elif isinstance(node, ast.ImportFrom) and node.module in imports:
            body.append(node)
        elif isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in definitions:
            body.append(node)
        elif isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "FLOWS" for t in node.targets):
            body.append(node)
    assert {n.name for n in body if isinstance(n, (ast.FunctionDef, ast.ClassDef))} == definitions
    module = types.ModuleType("test_mail_batch_n8n_e2e")
    module.__dict__.update(schemas)
    exec(compile(ast.Module(body=body, type_ignores=[]), str(path), "exec"), module.__dict__)
    sys.modules[module.__name__] = module
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ops-dir", type=Path, required=True)
    args = parser.parse_args()
    sources = {}
    for relative, digest in PINNED.items():
        path = args.ops_dir / relative
        content = path.read_bytes()
        if hashlib.sha256(content).hexdigest() != digest:
            raise RuntimeError("Source changed; audit and pin again before running: " + relative)
        sources[relative] = content
    wanted = {"LEADS_HEADERS", "PROSPECTOS_HEADERS", "SUPPRESSION_HEADERS", "MARKETING_CONSENT_SOURCES"}
    schemas = {}
    for node in ast.parse(sources["workflows/varcrm.py"]).body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in wanted:
                    schemas[target.id] = ast.literal_eval(node.value)
    assert set(schemas) == wanted
    guard = load_module("execution_guard", args.ops_dir / "tools/execution_guard.py")
    schemas["inspect_execution"] = guard.inspect_execution
    batch = reviewed_fixture_module(args.ops_dir / "workflows/test_mail_batch_n8n_e2e.py", schemas)
    scheduled = load_module("reviewed_native_schedule", args.ops_dir / "workflows/test_mail_scheduled_n8n_e2e.py")
    regenerator = load_module("reviewed_durable_regenerator", ROOT / "automation/n8n/durable_mail_builder.py")
    builder = regenerator.gate
    old_fixture = batch.fixture_graph
    old_post = scheduled.NativeHandler.do_POST
    checked_runs = []
    prepared = []

    def complete_fixture(original, config, server, **kwargs):
        kind = "nurture" if config[0] == "Leads" else "followup"
        # Test the gate ALREADY in the canonical source, not a copy with an
        # optional guard injected by this harness. A changed/missing gate fails.
        regenerator.validate_guarded_workflow(original, kind)
        patched = original
        # First sanitize ALL baseline transports; then add the unchanged new
        # guard and its stricter sender expression. Only ledger transport/auth
        # is fictional here; Header Auth has a separate isolated native test.
        baseline = copy.deepcopy(original)
        baseline["nodes"] = [n for n in baseline["nodes"] if n["name"] not in builder.NAMES]
        for name in builder.NAMES:
            baseline["connections"].pop(name, None)
        baseline["connections"][builder.UPSTREAM]["main"][0] = [{"node": config[4], "type": "main", "index": 0}]
        graph = old_fixture(baseline, config, server, **kwargs)
        new_nodes = {n["name"]: copy.deepcopy(n) for n in patched["nodes"] if n["name"] in builder.NAMES}
        check = new_nodes[builder.CHECK]
        check.pop("credentials", None)
        check["parameters"].pop("genericAuthType", None)
        check["parameters"].update(authentication="none", url=f"http://127.0.0.1:{server.server_port}/durable-check")
        graph["nodes"].extend(new_nodes.values())
        for source in (builder.UPSTREAM, *builder.NAMES):
            graph["connections"][source] = copy.deepcopy(patched["connections"][source])
        send = next(n for n in graph["nodes"] if n["name"] == config[4])
        send["parameters"]["jsonBody"] = builder.SEND_BODY
        send["retryOnFail"] = False
        assert all(not n.get("credentials") for n in graph["nodes"])
        assert all("https://" not in n["parameters"]["url"] for n in graph["nodes"] if n["type"] == "n8n-nodes-base.httpRequest")
        prepared.append(kind)
        return graph

    def durable_post(handler):
        if handler.path != "/durable-check":
            return old_post(handler)
        payload = json.loads(handler.rfile.read(int(handler.headers.get("content-length", "0"))))
        assert set(payload) == {"email"}
        assert payload["email"] in {f"qa{i}@example.com" for i in range(1, 6)}
        handler.server.requests.append(("durable-check", payload["email"]))
        handler.respond({"suppressed": payload["email"] == "qa4@example.com"})

    def check_effects(calls, scenario, baseline_count=1):
        assert scenario == "happy"
        expected = [f"qa{i}@example.com" for i in range(1, 6)]
        grouped = {}
        for kind, value in calls:
            grouped.setdefault(kind, []).append(value)
        for kind in ("reserve", "durable-check"):
            assert Counter(grouped.get(kind, [])) == Counter(expected), "Lost/duplicated reservation or last-moment check"
        for kind in ("send", "commit"):
            assert Counter(grouped.get(kind, [])) == Counter(expected[:3] + expected[4:]), "Suppressed recipient reached sender/commit or lost item linkage"
        assert len(grouped.get("alert", [])) == 1, "Durable opposition was not sent to manual review"
        checked_runs.append(True)

    scheduled.fixture_graph = complete_fixture
    scheduled.NativeHandler.do_POST = durable_post
    scheduled.check_calls = check_effects
    previous = os.umask(0o077)
    try:
        # The original helper's printed 'five sends' no longer describes this
        # stricter fixture. Keep it private; emit only the verified counts here.
        with contextlib.redirect_stdout(io.StringIO()):
            scheduled.run()
        assert sorted(prepared) == ["followup", "nurture"] and len(checked_runs) == 4
    finally:
        os.umask(previous)
    print("PASS: both complete reviewed mail graphs with unchanged new guard/Code/IF/body; actual Schedule Triggers and single-production dispatcher; 5 fictitious reservations/checks, 4 sends/commits and 1 durable block each.")
    print("PASS: same temporary DB/CRM state after restart; 4 actual native trigger executions; no additional sends, reservations, checks or commits. Temporary profile removed; real accounts/runtime/config untouched.")
    print("LIMIT: fixture transports/auth only; this is not Google/Gmail/consent/deployment proof. Synthetic execution histories are deleted with the temporary profile, not proof of no-save retention in production.")


if __name__ == "__main__":
    main()
