"""Offline safety checks for the optional full native mail test runner."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("complete_native_test", ROOT / "scripts/test-durable-complete-mail-n8n.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class CompleteMailFixtureTests(unittest.TestCase):
    def test_changed_source_rejected_before_import_or_execution(self):
        with tempfile.TemporaryDirectory(prefix="varino-native-contract-") as directory:
            path = Path(directory) / "tools"
            path.mkdir()
            (path / "execution_guard.py").write_text("raise RuntimeError('must never execute')")
            with patch.object(sys, "argv", ["fixture", "--ops-dir", directory]), \
                    patch.object(runner, "load_module", side_effect=AssertionError("unexpected import")):
                with self.assertRaisesRegex(RuntimeError, "Source changed; audit and pin again"):
                    runner.main()

    def test_ast_fixture_never_imports_private_configuration_or_chat(self):
        text = '''
import json
import os
from collections import Counter
from varcrm import PRIVATE_CONFIG
from test_chat_n8n_e2e import parse_cli_result
_CFG = open('/must/not/read/private/config').read()
FLOWS = {"test.json": ("Leads", LEADS_HEADERS)}
def rows(headers):
    return [headers]
class Fixtures:
    pass
class Handler:
    pass
def fixture_graph(value, *args, **kwargs):
    return value
def check_calls(*args):
    return True
def main():
    raise RuntimeError('must never execute')
'''
        source = types.SimpleNamespace(read_text=lambda **kwargs: text)
        with patch.dict(sys.modules):
            module = runner.reviewed_fixture_module(source, {"LEADS_HEADERS": ["email"]})
            self.assertEqual(module.rows(["email"]), [["email"]])
            self.assertEqual(module.FLOWS, {"test.json": ("Leads", ["email"])})
            self.assertNotIn("_CFG", module.__dict__)
            self.assertNotIn("PRIVATE_CONFIG", module.__dict__)
            self.assertNotIn("parse_cli_result", module.__dict__)
            self.assertNotIn("os", module.__dict__)
            self.assertNotIn("main", module.__dict__)

    def test_missing_reviewed_fixture_definition_rejected(self):
        source = types.SimpleNamespace(read_text=lambda **kwargs: "FLOWS = {}\ndef rows(headers): return []\n")
        with self.assertRaises(AssertionError):
            runner.reviewed_fixture_module(source, {})


if __name__ == "__main__":
    unittest.main()
