import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = resolve(projectRoot, "node_modules/wrangler/bin/wrangler.js");
assert.ok(existsSync(wrangler), "Instala las dependencias con npm ci antes de probar D1.");

const persistence = mkdtempSync(join(tmpdir(), "varino-autopilot-d1-"));
const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
delete env.CLOUDFLARE_API_TOKEN;
delete env.CF_API_TOKEN;

function execute(args, { expectedSuccess = true } = {}) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: projectRoot,
    env,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  const success = result.status === 0;
  assert.equal(success, expectedSuccess, success
    ? `El comando debía fallar: ${args[0]} ${args[1]}`
    : `Falló Wrangler: ${result.stderr || result.stdout}`);
  return `${result.stdout}\n${result.stderr}`;
}

try {
  const localOnly = ["--local", "--persist-to", persistence];
  execute(["d1", "migrations", "apply", "VARINO_DB", ...localOnly]);

  execute([
    "d1", "execute", "VARINO_DB", ...localOnly,
    "--command",
    `INSERT INTO users (id, email, created_at, updated_at)
       VALUES ('user-a', 'owner@example.test', 1, 1);
     UPDATE users SET google_subject = 'google-sub-a', email_verified_at = 1 WHERE id = 'user-a';
     INSERT INTO sessions (id, user_id, token_hash, issued_at, expires_at)
       VALUES ('session-a', 'user-a', '${"a".repeat(64)}', 1, 1000);
     INSERT INTO workspaces (id, name, slug, created_at, updated_at)
       VALUES ('workspace-a', 'Workspace A', 'workspace-a', 1, 1),
              ('workspace-b', 'Workspace B', 'workspace-b', 1, 1);
     INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at)
       VALUES ('workspace-a', 'user-a', 'OWNER', 1, 1);
     INSERT INTO automations (id, workspace_id, name, objective, created_by_user_id, created_at, updated_at)
       VALUES ('automation-a', 'workspace-a', 'Test', 'Test tenant isolation', 'user-a', 1, 1);
     INSERT INTO automation_versions (id, workspace_id, automation_id, version_number, plan_json, risk_level, approval_required, created_by_user_id, created_at)
       VALUES ('version-a', 'workspace-a', 'automation-a', 1, '{"schemaVersion":1}', 'low', 0, 'user-a', 1);
     INSERT INTO workflow_runs (id, workspace_id, automation_id, version_id, trigger_kind, idempotency_key, created_at)
       VALUES ('run-a', 'workspace-a', 'automation-a', 'version-a', 'manual', 'request-a', 1);
     INSERT INTO audit_events (id, workspace_id, actor_user_id, action, resource_type, resource_id, created_at)
       VALUES ('audit-a', 'workspace-a', 'user-a', 'automation.created', 'automation', 'automation-a', 1);
     INSERT INTO approvals (id, workspace_id, automation_id, version_id, requested_by_user_id, action_summary, created_at)
       VALUES ('approval-a', 'workspace-a', 'automation-a', 'version-a', 'user-a', 'Revisar el borrador', 1);`,
  ]);

  const ownerRemovalAttempt = execute([
    "d1", "execute", "VARINO_DB", ...localOnly,
    "--command",
    "UPDATE workspace_members SET status = 'suspended' WHERE workspace_id = 'workspace-a' AND user_id = 'user-a';",
  ], { expectedSuccess: false });
  assert.match(ownerRemovalAttempt, /workspace must retain an active owner/i);

  const crossTenantAttempt = execute([
    "d1", "execute", "VARINO_DB", ...localOnly,
    "--command",
    `INSERT INTO automations (id, workspace_id, name, objective, created_by_user_id, created_at, updated_at)
     VALUES ('automation-cross-tenant', 'workspace-b', 'Invalid', 'Must reject cross-tenant actor', 'user-a', 2, 2);`,
  ], { expectedSuccess: false });
  assert.match(crossTenantAttempt, /FOREIGN KEY constraint failed/i);

  const duplicateRunAttempt = execute([
    "d1", "execute", "VARINO_DB", ...localOnly,
    "--command",
    `INSERT INTO workflow_runs (id, workspace_id, automation_id, version_id, trigger_kind, idempotency_key, created_at)
     VALUES ('run-duplicate', 'workspace-a', 'automation-a', 'version-a', 'manual', 'request-a', 2);`,
  ], { expectedSuccess: false });
  assert.match(duplicateRunAttempt, /UNIQUE constraint failed/i);

  const auditMutationAttempt = execute([
    "d1", "execute", "VARINO_DB", ...localOnly,
    "--command",
    "UPDATE audit_events SET action = 'tampered' WHERE id = 'audit-a';",
  ], { expectedSuccess: false });
  assert.match(auditMutationAttempt, /audit events are append-only/i);

  const unresolvedApprovalAttempt = execute([
    "d1", "execute", "VARINO_DB", ...localOnly,
    "--command",
    "UPDATE approvals SET status = 'approved', resolved_at = 2 WHERE id = 'approval-a';",
  ], { expectedSuccess: false });
  assert.match(unresolvedApprovalAttempt, /CHECK constraint failed/i);

  execute([
    "d1", "execute", "VARINO_DB", ...localOnly,
    "--command",
    "UPDATE approvals SET status = 'approved', resolved_at = 2, resolved_by_user_id = 'user-a' WHERE id = 'approval-a';",
  ]);

  const integrity = execute([
    "d1", "execute", "VARINO_DB", ...localOnly, "--json",
    "--command",
    "SELECT (SELECT count(*) FROM automations) AS automation_count, (SELECT count(*) FROM workflow_runs) AS run_count, (SELECT count(*) FROM approvals WHERE status = 'approved' AND resolved_by_user_id IS NOT NULL) AS resolved_approval_count, (SELECT count(*) FROM audit_events) AS audit_count, (SELECT count(*) FROM sessions WHERE user_id = 'user-a' AND revoked_at IS NULL) AS live_session_count, (SELECT count(*) FROM users WHERE google_subject = 'google-sub-a' AND email_verified_at IS NOT NULL) AS google_identity_count, (SELECT count(*) FROM pragma_foreign_key_check) AS fk_errors;",
  ]);
  const parsed = JSON.parse(integrity.trim());
  const text = JSON.stringify(parsed);
  assert.match(text, /"automation_count":1/);
  assert.match(text, /"run_count":1/);
  assert.match(text, /"resolved_approval_count":1/);
  assert.match(text, /"audit_count":1/);
  assert.match(text, /"live_session_count":1/);
  assert.match(text, /"google_identity_count":1/);
  assert.match(text, /"fk_errors":0/);

  process.stdout.write("D1 local: migración, claves tenant, idempotencia e integridad OK.\n");
} finally {
  rmSync(persistence, { recursive: true, force: true });
}
