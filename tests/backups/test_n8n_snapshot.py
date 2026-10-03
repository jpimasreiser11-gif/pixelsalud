"""Failure-path and live-WAL tests for the local backup tool; synthetic data only."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("snapshot_tool", Path(__file__).resolve().parents[2] / "scripts" / "n8n-snapshot.py")
snapshot_tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot_tool)


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="varino-backup-test-")
        self.root = Path(self.temporary.name).resolve()
        self.profile = self.root / "profile"
        self.profile.mkdir(mode=0o700)
        (self.profile / "config").write_text(json.dumps({"encryptionKey": "synthetic-settings-key-for-test"}))
        self.connection = sqlite3.connect(self.profile / "database.sqlite")
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.executescript("""
            CREATE TABLE workflow_entity (id TEXT, name TEXT, active INTEGER, nodes TEXT,
                connections TEXT, settings TEXT, description TEXT);
            CREATE TABLE credentials_entity (id TEXT);
            CREATE TABLE execution_entity (id TEXT);
            INSERT INTO workflow_entity VALUES ('fixture', 'Fictional workflow', 0, '[]', '{}', '{}', 'Fixture');
        """)
        self.connection.commit()

    def tearDown(self):
        self.connection.close()
        self.temporary.cleanup()

    def test_committed_wal_survives_snapshot_with_private_settings(self):
        self.connection.execute("INSERT INTO execution_entity VALUES ('committed-in-wal')")
        self.connection.commit()
        snapshot = snapshot_tool.create_snapshot(self.profile, self.root / "backups")
        result = snapshot_tool.verify_snapshot(snapshot)
        self.assertEqual(result["counts"]["execution_entity"], 1)
        self.assertEqual(result["counts"]["workflow_entity"], 1)
        self.assertFalse(result["runtimeRestoreVerified"])
        self.assertEqual(snapshot.stat().st_mode & 0o777, 0o700)
        for filename in ("config", "database.sqlite", "manifest.json"):
            self.assertEqual((snapshot / filename).stat().st_mode & 0o777, 0o600)
        self.assertEqual((snapshot / "config").read_bytes(), (self.profile / "config").read_bytes())

    def test_snapshot_tampering_is_rejected_before_runtime(self):
        snapshot = snapshot_tool.create_snapshot(self.profile, self.root / "backups")
        (snapshot / "config").write_text(json.dumps({"encryptionKey": "changed-synthetic-key-for-test"}))
        with self.assertRaisesRegex(snapshot_tool.SnapshotError, "snapshot_config_hash_mismatch"):
            snapshot_tool.verify_snapshot(snapshot)

    def test_database_symlink_cannot_back_up_unintended_data(self):
        self.connection.close()
        original = self.profile / "database.sqlite"
        moved = self.root / "unintended.sqlite"
        original.rename(moved)
        original.symlink_to(moved)
        with self.assertRaisesRegex(snapshot_tool.SnapshotError, "invalid_database_file"):
            snapshot_tool.create_snapshot(self.profile, self.root / "backups")

    def test_binary_payload_survives_and_hash_rejects_changes(self):
        binaries = self.profile / "binaryData"
        binaries.mkdir()
        (binaries / "fixture.bin").write_bytes(b"synthetic-binary-fixture")
        snapshot = snapshot_tool.create_snapshot(self.profile, self.root / "backups")
        snapshot_tool.verify_snapshot(snapshot)
        (snapshot / "binaryData" / "fixture.bin").write_bytes(b"changed")
        with self.assertRaisesRegex(snapshot_tool.SnapshotError, "snapshot_binary_hash_mismatch"):
            snapshot_tool.verify_snapshot(snapshot)

    def test_custom_packages_require_an_explicit_restore_plan(self):
        packages = self.profile / "nodes"
        packages.mkdir()
        (packages / "package.json").write_text('{"dependencies":{"unreviewed-package":"1.0.0"}}')
        with self.assertRaisesRegex(snapshot_tool.SnapshotError, "community_packages_require_separate_backup_plan"):
            snapshot_tool.create_snapshot(self.profile, self.root / "backups")

    def test_parent_symlink_cannot_redirect_snapshot_destination(self):
        original = self.root / "unintended-destination"
        original.mkdir()
        alias = self.root / "alias"
        alias.symlink_to(original, target_is_directory=True)
        with self.assertRaisesRegex(snapshot_tool.SnapshotError, "symlink_directory_rejected"):
            snapshot_tool.create_snapshot(self.profile, alias / "backups")
        self.assertFalse((original / "backups").exists())


if __name__ == "__main__":
    unittest.main()
