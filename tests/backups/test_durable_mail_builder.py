"""Synthetic offline regeneration contracts: no private configuration/network."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from test_durable_mail_gate import fixture

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / "automation/n8n/durable_mail_builder.py"
spec = importlib.util.spec_from_file_location("durable_mail_builder", MODULE)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def fresh(kind):
    graph = fixture(kind)
    graph["name"] = "Synthetic " + kind
    graph["description"] = "Existing reviewed description"
    for node in graph["nodes"]:
        node["notesInFlow"] = False
    return graph


class DurableMailBuilderTests(unittest.TestCase):
    def test_both_variants_apply_every_rebuild_without_mutation_or_duplication(self):
        for kind in builder.gate.SPECS:
            generated = fresh(kind)
            previous = copy.deepcopy(generated)
            previous["tags"] = [{"id": "synthetic", "name": "reviewed"}]
            original = copy.deepcopy(previous)
            first = builder.regenerate_workflow(generated, kind, previous)
            different_ids = copy.deepcopy(generated)
            for index, node in enumerate(different_ids["nodes"]):
                node["id"] = "changed-random-" + str(index)
                node.pop("notes")
            second = builder.regenerate_workflow(different_ids, kind, first)
            self.assertEqual(first, second)
            self.assertEqual(previous, original)
            self.assertEqual(len(first["nodes"]), len(generated["nodes"]) + 4)
            self.assertFalse(first["active"])
            self.assertEqual(first["id"], previous["id"])
            self.assertEqual(first["tags"], previous["tags"])
            self.assertEqual(first["description"], previous["description"])
            nodes = builder.indexed_nodes(first)
            for old in previous["nodes"]:
                self.assertEqual(nodes[old["name"]]["id"], old["id"])
                self.assertTrue(nodes[old["name"]]["notes"].startswith(old["notes"]))
            self.assertTrue(builder.validate_guarded_workflow(second, kind))

    def test_new_export_identity_is_deterministic_even_if_source_node_ids_change(self):
        graph = fresh("nurture")
        changed = copy.deepcopy(graph)
        for node in changed["nodes"]:
            node["id"] += "-other"
        self.assertEqual(builder.regenerate_workflow(graph, "nurture"),
                         builder.regenerate_workflow(changed, "nurture"))

    def test_preserves_dedicated_and_other_manager_references(self):
        graph = fresh("nurture")
        send = builder.gate.SPECS["nurture"][0]
        for candidate in (graph,):
            builder.indexed_nodes(candidate)[send]["credentials"] = {
                "gmailOAuth2": {"id": "abcdefghijklmnop", "name": "Synthetic Gmail manager"}}
        first = builder.regenerate_workflow(graph, "nurture", graph)
        builder.indexed_nodes(first)[builder.gate.CHECK]["credentials"]["httpHeaderAuth"]["id"] = "0123456789abcdef"
        generated = copy.deepcopy(graph)
        builder.indexed_nodes(generated)[send]["credentials"]["gmailOAuth2"]["id"] = "placehold_gmailOAuth2"
        result = builder.regenerate_workflow(generated, "nurture", first)
        self.assertEqual(builder.indexed_nodes(result)[send]["credentials"], builder.indexed_nodes(graph)[send]["credentials"])
        self.assertEqual(builder.indexed_nodes(result)[builder.gate.CHECK]["credentials"], builder.indexed_nodes(first)[builder.gate.CHECK]["credentials"])

    def test_refuses_active_or_ambiguous_previous_id_change_missing_nodes_or_credentials(self):
        generated = fresh("nurture")
        mutations = []
        for active in (True, None, "false"):
            changed = copy.deepcopy(generated); changed["active"] = active; mutations.append(changed)
        changed = copy.deepcopy(generated); changed["id"] = "other"; mutations.append(changed)
        changed = copy.deepcopy(generated); changed["nodes"].append({"id": "extra", "name": "Custom step", "parameters": {}}); mutations.append(changed)
        changed = copy.deepcopy(generated); changed["nodes"][0]["id"] = changed["nodes"][1]["id"]; mutations.append(changed)
        changed = copy.deepcopy(generated); changed["nodes"][0]["credentials"] = {"httpHeaderAuth": {"id": "abcdefghijklmnop", "name": "QA", "value": "not-a-manager-reference"}}; mutations.append(changed)
        for previous in mutations:
            with self.subTest(previous=mutations.index(previous)), self.assertRaises(ValueError):
                builder.regenerate_workflow(generated, "nurture", previous)

    def test_refuses_partial_or_modified_previous_guard_instead_of_overwriting(self):
        generated = fresh("followup")
        previous = builder.regenerate_workflow(generated, "followup")
        mutations = []
        changed = copy.deepcopy(previous); changed["nodes"] = changed["nodes"][:-1]; mutations.append(changed)
        for field, value in (("disabled", True), ("executeOnce", True), ("alwaysOutputData", True), ("continueOnFail", True)):
            changed = copy.deepcopy(previous); builder.indexed_nodes(changed)[builder.gate.GATE][field] = value; mutations.append(changed)
        changed = copy.deepcopy(previous); builder.indexed_nodes(changed)[builder.gate.CHECK]["parameters"]["url"] = "https://other.example.test"; mutations.append(changed)
        changed = copy.deepcopy(previous); builder.indexed_nodes(changed)[builder.gate.AUTHORIZE]["parameters"]["jsCode"] += "\n// changed"; mutations.append(changed)
        changed = copy.deepcopy(previous); changed["connections"][builder.gate.GATE]["main"][1] = []; mutations.append(changed)
        changed = copy.deepcopy(previous); changed["connections"][builder.gate.UPSTREAM]["main"][1].append({"node": builder.gate.CHECK, "type": "main", "index": 0}); mutations.append(changed)
        changed = copy.deepcopy(previous); changed["settings"]["saveManualExecutions"] = True; mutations.append(changed)
        for index, graph in enumerate(mutations):
            with self.subTest(index=index), self.assertRaises(ValueError):
                builder.regenerate_workflow(generated, "followup", graph)

    def test_refuses_already_guarded_generated_input_or_unsafe_new_sender(self):
        generated = fresh("nurture")
        guarded = builder.regenerate_workflow(generated, "nurture")
        with self.assertRaises(ValueError): builder.regenerate_workflow(guarded, "nurture")
        builder.indexed_nodes(generated)["Enviar Gmail"]["disabled"] = True
        with self.assertRaises(ValueError): builder.regenerate_workflow(generated, "nurture")

    def test_cli_new_private_file_only_never_overwrites_previous(self):
        with tempfile.TemporaryDirectory(prefix="varino-regeneration-contract-") as directory:
            folder = Path(directory)
            source, output = folder / "source.json", folder / "output.json"
            original = json.dumps(fresh("nurture"))
            source.write_text(original)
            command = ["python3", str(MODULE), "--generated", str(source), "--previous", str(source), "--output", str(output), "--kind", "nurture"]
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)
            self.assertEqual(source.read_text(), original)
            saved = output.read_bytes()
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual(output.read_bytes(), saved)


if __name__ == "__main__":
    unittest.main()
