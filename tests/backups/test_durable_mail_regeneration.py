"""Offline safety tests for the optional private-emitter regression runner."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("mail_regeneration_runner", ROOT / "scripts/test-durable-mail-regeneration.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class MailRegenerationRunnerSafetyTests(unittest.TestCase):
    def test_schema_extraction_never_executes_private_config_or_imports(self):
        source = '''
raise RuntimeError("must not execute")
import varcrm_private_config
_CFG = open("must-not-open")
LEADS_HEADERS = ["email"]
PROSPECTOS_HEADERS = ["contacto_email"]
SUPPRESSION_HEADERS = ["email_normalizado"]
MARKETING_CONSENT_SOURCES = {"form": "checked-v1"}
'''
        module = runner.synthetic_config(source)
        self.assertEqual(module.CRM_SHEET_ID, "SYNTHETIC_SHEET_ONLY")
        self.assertEqual(module.LEADS_HEADERS, ["email"])
        self.assertNotIn("_CFG", module.__dict__)

    def test_missing_or_nonliteral_schema_is_rejected(self):
        for source in ("LEADS_HEADERS = []", "LEADS_HEADERS = open('must-not-open')"):
            with self.assertRaises(ValueError): runner.synthetic_config(source)

    def test_changed_private_source_is_rejected_before_execution(self):
        with tempfile.TemporaryDirectory(prefix="mail-source-pin-") as temporary:
            folder = Path(temporary)
            first = next(iter(runner.PINNED))
            path = folder / first
            path.parent.mkdir()
            path.write_text("raise RuntimeError('must not run')")
            with self.assertRaisesRegex(ValueError, "Changed source"):
                runner.reviewed_sources(folder)


if __name__ == "__main__": unittest.main()
