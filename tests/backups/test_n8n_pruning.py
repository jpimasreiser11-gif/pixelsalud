"""Offline safety checks only; native timer evidence is the separate CLI drill."""
import copy
import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("native_pruning_fixture", ROOT / "scripts/test-n8n-pruning.py")
pruning = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pruning)


class PruningFixtureSafety(unittest.TestCase):
    def test_environment_does_not_inherit_sensitive_or_production_settings(self):
        with patch.dict(os.environ, {"HOME": "/not-the-fixture", "GOOGLE_TOKEN": "synthetic",
                                     "HTTPS_PROXY": "http://not-the-fixture.invalid",
                                     "N8N_USER_FOLDER": "/production", "DB_TYPE": "postgresdb"}):
            env = pruning.isolated_environment(Path("/tmp/owned-fixture"), 32001, 32002)
        self.assertNotIn("HOME", env)
        self.assertNotIn("GOOGLE_TOKEN", env)
        self.assertNotIn("HTTPS_PROXY", env)
        self.assertNotIn("DB_TYPE", env)
        self.assertEqual(env["N8N_USER_FOLDER"], "/tmp/owned-fixture")
        self.assertEqual(env["N8N_LISTEN_ADDRESS"], "127.0.0.1")
        self.assertEqual(env["N8N_RUNNERS_BROKER_LISTEN_ADDRESS"], "127.0.0.1")
        self.assertEqual(env["EXECUTIONS_DATA_PRUNE"], "false")
        self.assertEqual(env["N8N_DIAGNOSTICS_ENABLED"], "false")

    def test_graph_is_inactive_and_contains_no_transports_or_credentials(self):
        graph = pruning.fixture_graph()
        self.assertFalse(graph["active"])
        self.assertEqual([n["type"] for n in graph["nodes"]],
                         ["n8n-nodes-base.manualTrigger", "n8n-nodes-base.set"])
        self.assertTrue(all("credentials" not in n for n in graph["nodes"]))
        self.assertEqual(graph["settings"]["saveDataSuccessExecution"], "all")

    def test_seed_refuses_persistent_paths_before_opening_any_database(self):
        for database in [Path("/real/.n8n/database.sqlite"),
                         Path("/tmp/varino-native-pruning-fixture/database.sqlite"),
                         Path("/tmp/varino-native-pruning-fixture/.n8n/other.sqlite")]:
            with self.subTest(database=database), patch.object(pruning, "metadata") as query:
                with self.assertRaises(ValueError):
                    pruning.seed_soft_deleted_diagnostic(database, "synthetic-workflow")
                query.assert_not_called()

    def test_seed_rejects_unexpected_data_or_live_executions(self):
        baseline = {"workflow_count": 1, "credential_count": 1, "active_count": 0,
                    "executions": [(1, "qa", "cli", "success", 1, None), (2, "qa", "cli", "success", 1, None)],
                    "payloads": [(1,), (2,)]}
        invalid = []
        for key, value in [("workflow_count", 2), ("credential_count", 2), ("active_count", 1),
                           ("payloads", [(1,)]), ("executions", [(1, "qa", "manual", "running", 0, None), baseline["executions"][1]])]:
            actual = copy.deepcopy(baseline)
            actual[key] = value
            invalid.append(actual)
        for actual in invalid:
            with self.subTest(actual=actual), patch.object(pruning, "metadata", return_value=actual), patch.object(pruning.sqlite3, "connect") as connect:
                with self.assertRaises(ValueError):
                    pruning.seed_soft_deleted_diagnostic(Path("/tmp/varino-native-pruning-owned/.n8n/database.sqlite"), "qa")
                connect.assert_not_called()

    def test_unrelated_asset_or_integrity_change_fails_verification(self):
        baseline = {"workflow_digest": "qa-workflow", "credential_digest": "qa-credential",
                    "workflow_count": 1, "credential_count": 1, "active_count": 0, "integrity": "ok"}
        pruning.verify_assets(baseline, baseline)
        for key in baseline:
            with self.subTest(key=key):
                changed = {**baseline, key: "changed"}
                with self.assertRaises(AssertionError):
                    pruning.verify_assets(changed, baseline)


if __name__ == "__main__":
    unittest.main()
