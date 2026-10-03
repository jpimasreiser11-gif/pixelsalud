#!/usr/bin/env python3
"""Exercise actual reviewed private mail emitters twice, using synthetic config.

No private CRM config is imported, no runtime is opened and no transport runs.
Only pinned builder/helper source and literal schemas are used. Outputs live
in a disposable directory; the canonical exports themselves are never edited.
"""
from __future__ import annotations
import argparse
import ast
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import types

ROOT = Path(__file__).resolve().parent.parent
PINNED = {
    "workflows/wfkit.py": "15d578f1e6dd271e38b57e00d23d56e3fff2e3665a0f744f5b64cfc380a7170d",
    "workflows/wf_nurture.py": "274b84d4ced016f3397925263e10bab6fc712fe038f3db485aa944a47ac10bd2",
    "workflows/wf_followup.py": "ea1cefcc1d39fc6db6bce956778055dd1c66304792a435b3f6e8cadf9b62332d",
    "workflows/mail_preflight.py": "7f53935c49f8754239d70e31c1babc69b3673446bcbe8c9db4f90992c2ffbaf5",
    "workflows/varcrm.py": "9a675abcf2879036d98602b8d6e87e17c30818acda71ee7d781d9a26e743746a",
    "tools/sync_reply_citas.py": "0280a78febf72df80448a8607749b302648368022fb70baa5baddcd6767f2356",
}


def reviewed_sources(ops):
    sources = {}
    for relative, digest in PINNED.items():
        path = ops / relative
        content = path.read_bytes()
        if hashlib.sha256(content).hexdigest() != digest:
            raise ValueError("Changed source; audit and pin before executing: " + relative)
        sources[relative] = content
    for filename in ("durable_mail_builder.py", "add-durable-mail-gate.py"):
        content = (ops / "workflows" / filename).read_bytes()
        if content != (ROOT / "automation/n8n" / filename).read_bytes():
            raise ValueError("Installed mail transformer differs from reviewed repository copy")
    return sources


def synthetic_config(source):
    wanted = {"LEADS_HEADERS", "PROSPECTOS_HEADERS", "SUPPRESSION_HEADERS", "MARKETING_CONSENT_SOURCES"}
    module = types.ModuleType("varcrm")
    for node in ast.parse(source).body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in wanted:
                    setattr(module, target.id, ast.literal_eval(node.value))
    if not all(hasattr(module, key) for key in wanted):
        raise ValueError("Reviewed literal CRM schemas missing")
    module.CRM_SHEET_ID = "SYNTHETIC_SHEET_ONLY"
    module.SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets"
    module.CRED_SHEETS, module.CRED_GMAIL, module.CRED_TELEGRAM = "QA Sheets", "QA Gmail", "QA Telegram"
    module.COMMERCIAL_OPERATOR_IDENTITY = "Entidad ficticia QA"
    return module


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def run(ops):
    sources = reviewed_sources(ops)
    # Inject synthetic metadata before loading any helper; never import varcrm.
    sys.modules["varcrm"] = synthetic_config(sources["workflows/varcrm.py"])
    sys.path.insert(0, str(ops / "workflows"))
    kit = load_module("wfkit", ops / "workflows/wfkit.py")
    transform = load_module("durable_mail_builder", ops / "workflows/durable_mail_builder.py")
    load_module("mail_preflight", ops / "workflows/mail_preflight.py")
    sync = load_module("reviewed_mail_sync", ops / "tools/sync_reply_citas.py")
    variants = (("5-nurture-emails.json", "wf_nurture.py", "nurture"),
                ("11-followup-prospectos.json", "wf_followup.py", "followup"))
    with tempfile.TemporaryDirectory(prefix="varino-mail-regeneration-") as temporary:
        root = Path(temporary)
        flows = root / "workflows"
        flows.mkdir(mode=0o700)
        sync.ROOT = root
        with contextlib.redirect_stdout(io.StringIO()):
            for filename, builder, kind in variants:
                target = flows / filename
                target.write_bytes((ops / "workflows" / filename).read_bytes())
                source = sources["workflows/" + builder]
                script = flows / builder
                script.write_bytes(source)
                original = json.loads(target.read_text())
                def execute():
                    exec(compile(source, str(script), "exec"), {"__name__": "__main__", "__file__": str(script)})
                execute()
                first = target.read_bytes()
                graph = json.loads(first)
                transform.validate_guarded_workflow(graph, kind)
                assert target.stat().st_mode & 0o777 == 0o600
                assert graph["id"] == original["id"] and graph["active"] is False
                assert all(n.get("notes") and n.get("notesInFlow") is False for n in graph["nodes"])
                for old in original["nodes"]:
                    new = next(n for n in graph["nodes"] if n["name"] == old["name"])
                    assert new["id"] == old["id"] and new["notes"].startswith(old["notes"])
                    assert new.get("credentials") == old.get("credentials")
                assert "SYNTHETIC_SHEET_ONLY" in first.decode()
                execute()
                assert target.read_bytes() == first, "Regeneration changed stable graph metadata"
                _, captured = sync.candidate(filename, builder)
                assert captured == graph, "Sync capture bypassed/dropped mandatory durable gate"
                changed = json.loads(first)
                next(n for n in changed["nodes"] if n["name"] == transform.gate.GATE)["disabled"] = True
                target.write_text(json.dumps(changed))
                damaged = target.read_bytes()
                try:
                    execute()
                except ValueError:
                    pass
                else:
                    raise AssertionError("Changed guard was silently overwritten")
                assert target.read_bytes() == damaged
                assert not list(flows.glob(".varino-mail-build-*"))
    print("PASS: both actual canonical builders regenerated twice through their real atomic emitter; stable IDs/notes/manager references and durable gate preserved.")
    print("PASS: actual sync capture keeps the same guard; changed prior gate refused without overwrite. Synthetic config only; no private config, n8n runtime or remote effects; temporary outputs removed.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ops-dir", type=Path, required=True)
    run(parser.parse_args().ops_dir)


if __name__ == "__main__":
    main()
