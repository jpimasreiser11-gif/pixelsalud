#!/usr/bin/env python3
"""Mandatory durable opposition gate when regenerating reviewed mail exports.

Pure graph transformation: no private config, accounts, import or activation.
The generated input is the reviewed *pre-gate* builder output. Previous exports
provide stable IDs, documentation and credential-manager references only.
Modified/partial previous guards require review rather than silent repair.
"""
from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import os
from pathlib import Path
import re
import uuid

_spec = importlib.util.spec_from_file_location(
    "varino_durable_gate", Path(__file__).with_name("add-durable-mail-gate.py")
)
gate = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gate)

MAIL_FILES = {"5-nurture-emails.json": "nurture", "11-followup-prospectos.json": "followup"}
EXECUTABLE_FIELDS = ("type", "typeVersion", "parameters", "onError", "retryOnFail",
                     "maxTries", "waitBetweenTries", "disabled", "executeOnce", "alwaysOutputData", "continueOnFail")
REFERENCE = re.compile(r"(?:[A-Za-z0-9]{16}|[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}|placehold_[A-Za-z][A-Za-z0-9]*|REPLACE_WITH_[A-Z_]+)")


def indexed_nodes(graph):
    if not isinstance(graph.get("nodes"), list) or not isinstance(graph.get("connections"), dict):
        raise ValueError("Malformed graph")
    nodes = {n["name"]: n for n in graph["nodes"]}
    ids = [n.get("id") for n in graph["nodes"]]
    if len(nodes) != len(graph["nodes"]) or not all(ids) or len(set(ids)) != len(ids):
        raise ValueError("Duplicate/missing node names or IDs")
    for node in nodes.values():
        for reference in node.get("credentials", {}).values():
            if not isinstance(reference, dict) or set(reference) != {"id", "name"} \
                    or not isinstance(reference["id"], str) or not REFERENCE.fullmatch(reference["id"]) \
                    or not isinstance(reference["name"], str) or not reference["name"].strip():
                raise ValueError("Credential manager references only; no values/extra fields")
    return nodes


def validate_guarded_workflow(graph, kind):
    """Validate existing guard code, settings, transport and all incident edges."""
    if graph.get("active", False) is not False:
        raise ValueError("Never regenerate an active/ambiguous export")
    nodes = indexed_nodes(graph)
    if not all(name in nodes for name in gate.NAMES):
        raise ValueError("Complete durable gate required")
    send = gate.SPECS[kind][0]
    credential_id = nodes[gate.CHECK]["credentials"]["httpHeaderAuth"]["id"]
    base = copy.deepcopy(graph)
    base["nodes"] = [n for n in base["nodes"] if n["name"] not in gate.NAMES]
    for name in gate.NAMES:
        base["connections"].pop(name, None)
    base["connections"][gate.UPSTREAM]["main"][0] = [{"node": send, "type": "main", "index": 0}]
    expected = gate.patch_workflow(base, kind, credential_id=credential_id)
    expected_nodes = indexed_nodes(expected)
    for name, source in zip(gate.NAMES, (gate.UPSTREAM, *gate.NAMES[:-1])):
        if [(s, i) for s, i, t in gate.edges(graph) if t == name] != [(source, 0)]:
            raise ValueError("Alternate incoming path to durable gate")
    for name in (*gate.NAMES, send):
        if any(nodes[name].get(field, False) is not False
               for field in ("disabled", "executeOnce", "alwaysOutputData", "continueOnFail")):
            raise ValueError("Unsafe durable control execution override")
        for field in EXECUTABLE_FIELDS:
            if nodes[name].get(field) != expected_nodes[name].get(field):
                raise ValueError("Existing durable control changed; review required: " + name)
    if nodes[gate.CHECK].get("credentials") != expected_nodes[gate.CHECK].get("credentials"):
        raise ValueError("Unexpected durable credential reference")
    if graph["connections"] != expected["connections"]:
        raise ValueError("Existing durable gate edges changed; review required")
    for key, value in expected["settings"].items():
        if graph.get("settings", {}).get(key) != value:
            raise ValueError("Existing durable workflow settings changed")
    return True


def regenerate_workflow(generated, kind, previous=None):
    """Apply the guard every time; preserve old metadata without duplicate nodes."""
    if kind not in gate.SPECS:
        raise ValueError("Unsupported mail graph")
    fresh = copy.deepcopy(generated)
    indexed_nodes(fresh)
    if not isinstance(fresh.get("id"), str) or not fresh["id"]:
        raise ValueError("Stable workflow ID required")
    old_nodes = {}
    guarded = False
    credential_id = "REPLACE_WITH_SUPPRESSION_CHECK_CREDENTIAL_ID"
    if previous is not None:
        if previous.get("active", False) is not False or previous.get("id") != fresh["id"]:
            raise ValueError("Active/ambiguous previous export or workflow ID changed")
        old_nodes = indexed_nodes(previous)
        present = set(gate.NAMES) & old_nodes.keys()
        if present and present != set(gate.NAMES):
            raise ValueError("Partial previous durable gate; review required")
        guarded = bool(present)
        if guarded:
            validate_guarded_workflow(previous, kind)
            credential_id = old_nodes[gate.CHECK]["credentials"]["httpHeaderAuth"]["id"]
    result = gate.patch_workflow(fresh, kind, credential_id=credential_id)
    new_nodes = indexed_nodes(result)
    if not old_nodes.keys() <= new_nodes.keys():
        raise ValueError("Regeneration would remove previous nodes; review required")
    namespace = uuid.uuid5(uuid.NAMESPACE_URL, "varino:mail-builder:" + fresh["id"])
    send = gate.SPECS[kind][0]
    sender_before = next(n for n in fresh["nodes"] if n["name"] == send)
    sender_suffix = new_nodes[send]["notes"][len(sender_before.get("notes", "")):]
    for name, node in new_nodes.items():
        old = old_nodes.get(name)
        if old is None:
            # Builder-generated random IDs are not an identity across rebuilds.
            node["id"] = str(uuid.uuid5(namespace, name))
            continue
        if set(old.get("credentials", {})) != set(node.get("credentials", {})):
            raise ValueError("Credential type changed; review required: " + name)
        node["id"] = old["id"]
        if "credentials" in old:
            node["credentials"] = copy.deepcopy(old["credentials"])
        for key in ("notes", "notesInFlow", "webhookId"):
            if key in old:
                node[key] = copy.deepcopy(old[key])
        if name == send and not guarded:
            node["notes"] = old.get("notes", "") + sender_suffix
    if previous is not None:
        for key in ("description", "tags"):
            if key in previous:
                result[key] = copy.deepcopy(previous[key])
    indexed_nodes(result)
    validate_guarded_workflow(result, kind)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--generated", type=Path, required=True)
    parser.add_argument("--previous", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--kind", choices=gate.SPECS, required=True)
    args = parser.parse_args()
    result = regenerate_workflow(
        json.loads(args.generated.read_text(encoding="utf-8")), args.kind,
        json.loads(args.previous.read_text(encoding="utf-8")) if args.previous else None,
    )
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, indent=1)
        output.write("\n")
    print("Prepared inactive durable mail export; stable IDs/notes/references preserved. No import or send.")


if __name__ == "__main__":
    main()
