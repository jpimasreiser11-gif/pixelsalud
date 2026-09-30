#!/usr/bin/env python3
"""Online n8n snapshots and restore drills, with no network or workflow execution.

The snapshot contains the encrypted SQLite store and its encryption settings.
Keep the entire directory private; this tool never exports decrypted credentials.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import stat
import subprocess
import tempfile
import time
from datetime import datetime, timezone
import uuid


class SnapshotError(Exception):
    pass


FIELDS = ("id", "name", "active", "nodes", "connections", "settings", "description")
TABLES = ("workflow_entity", "credentials_entity", "execution_entity")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_digest(path):
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def copy_private(source, destination):
    fd = os.open(str(destination), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as output, source.open("rb") as original:
        shutil.copyfileobj(original, output, length=1024 * 1024)
        output.flush()
        os.fsync(output.fileno())


def private_file(path, data):
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def check_directory(path):
    candidate = Path(path).absolute()
    if candidate.is_symlink():
        raise SnapshotError("symlink_directory_rejected")
    resolved = candidate.resolve()
    if resolved != candidate:
        raise SnapshotError("symlink_directory_rejected")
    if resolved in (Path("/"), Path.home(), Path("/Users")):
        raise SnapshotError("broad_directory_rejected")
    return resolved


def config_bytes(profile):
    path = profile / "config"
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 65536:
        raise SnapshotError("invalid_encryption_config")
    data = path.read_bytes()
    try:
        config = json.loads(data)
        key = config.get("encryptionKey") if isinstance(config, dict) else None
        if not isinstance(key, str) or len(key) < 16:
            raise ValueError()
    except (ValueError, TypeError):
        raise SnapshotError("invalid_encryption_config")
    return data


def normalized_workflows(rows):
    result = []
    for row in rows:
        item = {field: row[field] for field in FIELDS}
        item["active"] = bool(item["active"])
        for field in ("nodes", "connections", "settings"):
            if isinstance(item[field], str):
                item[field] = json.loads(item[field])
        result.append(item)
    return sorted(result, key=lambda item: item["id"])


def inventory(database):
    if database.is_symlink() or not database.is_file():
        raise SnapshotError("invalid_database_file")
    connection = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=5)
    connection.row_factory = sqlite3.Row
    try:
        if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise SnapshotError("database_integrity_failed")
        counts = {table: connection.execute("SELECT COUNT(*) FROM " + table).fetchone()[0] for table in TABLES}
        rows = connection.execute("SELECT " + ",".join(FIELDS) + " FROM workflow_entity").fetchall()
        workflows = normalized_workflows(rows)
        fingerprint = digest(json.dumps(workflows, sort_keys=True, ensure_ascii=False).encode())
        return {"counts": counts, "workflowFingerprint": fingerprint}
    finally:
        connection.close()


def binary_files(profile):
    root = profile / "binaryData"
    if root.is_symlink():
        raise SnapshotError("symlink_binary_data_rejected")
    if not root.exists():
        return []
    files = []
    for path in root.rglob("*"):
        if path.is_symlink():
            raise SnapshotError("symlink_binary_data_rejected")
        if path.is_file():
            files.append(path)
    return sorted(files)


def custom_packages(profile):
    package = profile / "nodes" / "package.json"
    if not package.exists():
        return False
    if package.is_symlink() or package.stat().st_size > 65536:
        raise SnapshotError("invalid_community_package_manifest")
    manifest = json.loads(package.read_text())
    return bool(manifest.get("dependencies") or manifest.get("devDependencies"))


def create_snapshot(profile_path, destination_path):
    profile = check_directory(profile_path)
    destination = check_directory(destination_path)
    if destination == profile or profile in destination.parents:
        raise SnapshotError("snapshot_destination_inside_profile")
    if not profile.is_dir():
        raise SnapshotError("profile_missing")
    if custom_packages(profile):
        # The restore drill intentionally cannot install/run third-party packages.
        raise SnapshotError("community_packages_require_separate_backup_plan")
    database = profile / "database.sqlite"
    if database.is_symlink() or not database.is_file():
        raise SnapshotError("invalid_database_file")
    config = config_bytes(profile)
    binaries = binary_files(profile)
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    if destination.stat().st_uid != os.getuid():
        raise SnapshotError("snapshot_destination_not_owned")
    os.chmod(destination, 0o700)
    total_size = database.stat().st_size + sum(path.stat().st_size for path in binaries)
    wal = profile / "database.sqlite-wal"
    if wal.is_file():
        total_size += wal.stat().st_size
    if shutil.disk_usage(destination).free < total_size * 2 + 512 * 1024 * 1024:
        raise SnapshotError("insufficient_snapshot_disk_space")
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    snapshot = destination / ("varino-n8n-" + stamp + "-" + uuid.uuid4().hex[:8])
    snapshot.mkdir(mode=0o700)
    private_file(snapshot / ".incomplete", b"Snapshot not verified yet.\n")
    deadline = time.monotonic() + 45

    def progress(_status, _remaining, _total):
        if time.monotonic() > deadline:
            raise SnapshotError("snapshot_database_timeout")

    source = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=5)
    output = snapshot / "database.sqlite"
    private_file(output, b"")
    target = sqlite3.connect(str(output))
    try:
        source.backup(target, pages=128, progress=progress, sleep=0.05)
        # A standalone snapshot must not require the source WAL/SHM files.
        # Change only the copied database to rollback-journal mode.
        if target.execute("PRAGMA journal_mode=DELETE").fetchone()[0] != "delete":
            raise SnapshotError("snapshot_journal_mode_failed")
    finally:
        target.close()
        source.close()
    if config_bytes(profile) != config:
        raise SnapshotError("encryption_config_changed_during_snapshot")
    private_file(snapshot / "config", config)
    stored_binaries = []
    for path in binaries:
        before = path.stat()
        relative = path.relative_to(profile)
        copied = snapshot / relative
        copied.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        copy_private(path, copied)
        after = path.stat()
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise SnapshotError("binary_data_changed_during_snapshot")
        stored_binaries.append({"path": str(relative), "sha256": file_digest(copied)})
    if binary_files(profile) != binaries or any(
        file_digest(profile / item["path"]) != item["sha256"] for item in stored_binaries
    ):
        raise SnapshotError("binary_data_changed_during_snapshot")
    details = inventory(output)
    manifest = {
        "formatVersion": 1,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "databaseSha256": file_digest(output),
        "configSha256": digest(config),
        "binaryFiles": stored_binaries,
        "sqliteIntegrity": "ok",
        **details,
    }
    encoded_manifest = json.dumps(manifest, indent=2).encode()
    if len(encoded_manifest) > 1024 * 1024:
        raise SnapshotError("snapshot_manifest_size_limit")
    private_file(snapshot / "manifest.json", encoded_manifest)
    (snapshot / ".incomplete").unlink()
    return snapshot


def verify_snapshot(snapshot_path, n8n_cli=None):
    snapshot = check_directory(snapshot_path)
    manifest_path = snapshot / "manifest.json"
    if (snapshot / ".incomplete").exists() or manifest_path.is_symlink():
        raise SnapshotError("snapshot_incomplete")
    if not manifest_path.is_file() or manifest_path.stat().st_size > 1024 * 1024:
        raise SnapshotError("invalid_snapshot_manifest")
    manifest = json.loads(manifest_path.read_text())
    database = snapshot / "database.sqlite"
    if manifest.get("formatVersion") != 1:
        raise SnapshotError("unsupported_snapshot_format")
    config = config_bytes(snapshot)
    if digest(config) != manifest.get("configSha256"):
        raise SnapshotError("snapshot_config_hash_mismatch")
    if database.is_symlink() or file_digest(database) != manifest.get("databaseSha256"):
        raise SnapshotError("snapshot_database_hash_mismatch")
    details = inventory(database)
    if any(details[key] != manifest.get(key) for key in details):
        raise SnapshotError("snapshot_inventory_mismatch")
    for binary in manifest.get("binaryFiles", []):
        relative = Path(binary["path"])
        if relative.is_absolute() or ".." in relative.parts or relative.parts[0] != "binaryData":
            raise SnapshotError("invalid_snapshot_binary_path")
        path = snapshot / relative
        if any(parent.is_symlink() for parent in (path, *path.parents) if parent != snapshot and snapshot in parent.parents):
            raise SnapshotError("symlink_binary_data_rejected")
        if file_digest(path) != binary.get("sha256"):
            raise SnapshotError("snapshot_binary_hash_mismatch")
    result = {"sqliteIntegrity": "ok", **details, "runtimeRestoreVerified": False}
    if not n8n_cli:
        return result
    if not Path(n8n_cli).is_file() or not os.access(n8n_cli, os.X_OK):
        raise SnapshotError("n8n_cli_missing")
    with tempfile.TemporaryDirectory(prefix="varino-n8n-restore-") as temporary:
        root = Path(temporary)
        profile = root / ".n8n"
        profile.mkdir(mode=0o700)
        for filename in ("database.sqlite", "config"):
            copy_private(snapshot / filename, profile / filename)
        exported = root / "restored-workflows.json"
        environment = {key: value for key, value in os.environ.items() if key in (
            "PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "TEMP", "TMP",
        )}
        environment.update({
            "DB_TYPE": "sqlite",
            "N8N_USER_FOLDER": str(root),
            "N8N_DIAGNOSTICS_ENABLED": "false",
            "N8N_VERSION_NOTIFICATIONS_ENABLED": "false",
            "N8N_COMMUNITY_PACKAGES_ENABLED": "false",
            "N8N_LICENSE_AUTO_RENEW_ENABLED": "false",
            "N8N_LOG_LEVEL": "error",
            "N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS": "true",
        })
        command = [str(n8n_cli), "export:workflow", "--all", "--output=" + str(exported)]
        completed = subprocess.run(command, env=environment, capture_output=True, timeout=60)
        if completed.returncode != 0 or not exported.is_file():
            raise SnapshotError("restored_n8n_runtime_export_failed")
        # Exported workflows may carry data: never print them or subprocess logs.
        os.chmod(exported, 0o600)
        workflows = json.loads(exported.read_text())
        fingerprint = digest(json.dumps(normalized_workflows(workflows), sort_keys=True, ensure_ascii=False).encode())
        restored = inventory(profile / "database.sqlite")
        if fingerprint != details["workflowFingerprint"] or restored != details:
            raise SnapshotError("restored_n8n_runtime_inventory_mismatch")
        result["runtimeRestoreVerified"] = True
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    backup = commands.add_parser("backup")
    backup.add_argument("--profile", required=True)
    backup.add_argument("--destination", required=True)
    backup.add_argument("--verify-runtime", action="store_true")
    backup.add_argument("--n8n-cli", default="/opt/homebrew/bin/n8n")
    verify = commands.add_parser("verify")
    verify.add_argument("--snapshot", required=True)
    verify.add_argument("--verify-runtime", action="store_true")
    verify.add_argument("--n8n-cli", default="/opt/homebrew/bin/n8n")
    args = parser.parse_args()
    os.umask(0o077)
    # launchd opens log files before the child's umask takes effect.
    for descriptor in (1, 2):
        try:
            details = os.fstat(descriptor)
            if stat.S_ISREG(details.st_mode) and details.st_uid == os.getuid():
                os.fchmod(descriptor, 0o600)
        except OSError:
            pass
    try:
        snapshot = create_snapshot(args.profile, args.destination) if args.command == "backup" else Path(args.snapshot)
        result = verify_snapshot(snapshot, args.n8n_cli if args.verify_runtime else None)
        print(json.dumps({"ok": True, "snapshot": str(snapshot), **result}))
        return 0
    except SnapshotError as error:
        print(json.dumps({"ok": False, "error": str(error)}))
    except Exception as error:
        # Never print exception values, SQL, environment, credentials or CLI logs.
        print(json.dumps({"ok": False, "error": "snapshot_operation_failed", "type": type(error).__name__}))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
