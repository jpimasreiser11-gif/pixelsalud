import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = resolve(projectRoot, "node_modules/wrangler/bin/wrangler.js");
assert.ok(existsSync(resolve(projectRoot, "dist/app/index.html")), "Ejecuta npm run build antes de probar Pages Functions.");
assert.ok(existsSync(wrangler), "Instala las dependencias con npm ci antes de probar Pages Functions.");

const persistence = mkdtempSync(join(tmpdir(), "varino-autopilot-auth-runtime-"));
assert.ok(persistence.startsWith(join(tmpdir(), "varino-autopilot-auth-runtime-")));
const environment = { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1" };
delete environment.CLOUDFLARE_API_TOKEN;
delete environment.CF_API_TOKEN;

function runWrangler(args) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: projectRoot,
    env: environment,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Wrangler falló: ${result.stderr || result.stdout}`);
  return `${result.stdout}\n${result.stderr}`;
}

async function unusedPort() {
  const listener = createServer();
  await new Promise((resolveListen, reject) => listener.once("error", reject).listen(0, "127.0.0.1", resolveListen));
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolveClose, reject) => listener.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

async function waitForServer(server, url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Wrangler terminó antes de servir: ${server.output}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.status === 401) return;
    } catch { /* server is still starting */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(`Pages Functions no respondió a tiempo: ${server.output}`);
}

try {
  const localOnly = ["--local", "--persist-to", persistence];
  runWrangler(["d1", "migrations", "apply", "VARINO_DB", ...localOnly]);

  const port = await unusedPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [
    wrangler,
    "pages", "dev", "dist", "--local", "--port", String(port), "--persist-to", persistence,
    "--compatibility-date", "2026-09-17",
    "--binding", `APP_BASE_URL=${baseUrl}`,
    "--binding", "GOOGLE_CLIENT_ID=",
    "--binding", "GOOGLE_CLIENT_SECRET=",
    "--binding", "OAUTH_STATE_SECRET=",
    "--show-interactive-dev-session", "false",
    "--log-level", "error",
  ], { cwd: projectRoot, env: environment, stdio: ["ignore", "pipe", "pipe"] });
  server.output = "";
  const keepTail = (chunk) => { server.output = `${server.output}${chunk}`.slice(-4000); };
  server.stdout.setEncoding("utf8").on("data", keepTail);
  server.stderr.setEncoding("utf8").on("data", keepTail);

  try {
    await waitForServer(server, `${baseUrl}/api/auth/session`);

    const staticApp = await fetch(`${baseUrl}/app/`);
    assert.equal(staticApp.status, 200);
    assert.match(await staticApp.text(), /Tu espacio de trabajo/);

    const unconfiguredStart = await fetch(`${baseUrl}/api/auth/google/start`, {
      method: "POST",
      headers: { origin: baseUrl, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(unconfiguredStart.status, 503);
    assert.deepEqual(await unconfiguredStart.json(), { error: "sign_in_unavailable" });

    const sessionToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
    const userId = randomUUID();
    const sessionId = randomUUID();
    const otherUserId = randomUUID();
    const otherWorkspaceId = randomUUID();
    const otherSessionId = randomUUID();
    const otherSessionToken = randomBytes(32).toString("base64url");
    const otherTokenHash = createHash("sha256").update(otherSessionToken).digest("hex");
    const otherAutomationId = randomUUID();
    const otherVersionId = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const sql = `INSERT INTO users (id, email, google_subject, email_verified_at, status, created_at, updated_at)
      VALUES ('${userId}', 'auth-test@example.test', 'google-sub-auth-test', ${now}, 'active', ${now}, ${now});
      INSERT INTO users (id, email, google_subject, email_verified_at, status, created_at, updated_at)
      VALUES ('${otherUserId}', 'other-auth-test@example.test', 'google-sub-other-test', ${now}, 'active', ${now}, ${now});
      INSERT INTO sessions (id, user_id, token_hash, issued_at, expires_at)
      VALUES ('${sessionId}', '${userId}', '${tokenHash}', ${now}, ${now + 3600});
      INSERT INTO sessions (id, user_id, token_hash, issued_at, expires_at)
      VALUES ('${otherSessionId}', '${otherUserId}', '${otherTokenHash}', ${now}, ${now + 3600});
      INSERT INTO workspaces (id, name, slug, status, created_at, updated_at)
      VALUES ('${otherWorkspaceId}', 'Other tenant', 'other-tenant-test', 'active', ${now}, ${now});
      INSERT INTO workspace_members (workspace_id, user_id, role, status, created_at, updated_at)
      VALUES ('${otherWorkspaceId}', '${otherUserId}', 'OWNER', 'active', ${now}, ${now});
      INSERT INTO automations (id, workspace_id, name, objective, status, autonomy, created_by_user_id, created_at, updated_at)
      VALUES ('${otherAutomationId}', '${otherWorkspaceId}', 'B confidential draft', 'Private fixture for tenant isolation.', 'draft', 'safe', '${otherUserId}', ${now}, ${now});
      INSERT INTO automation_versions (id, workspace_id, automation_id, version_number, plan_json, risk_level, approval_required, created_by_user_id, created_at)
      VALUES ('${otherVersionId}', '${otherWorkspaceId}', '${otherAutomationId}', 1, '{"schemaVersion":1,"name":"B confidential draft","objective":"Private fixture for tenant isolation.","trigger":{"kind":"manual"},"requiredIntegrations":[],"steps":[{"id":"resumir-texto","kind":"summarize","instruction":"Summarize only fixture text for workspace B."}]}', 'low', 0, '${otherUserId}', ${now});`;
    runWrangler(["d1", "execute", "VARINO_DB", ...localOnly, "--command", sql]);
    const cookie = `varino_session=${sessionToken}`;

    const authenticated = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
    assert.equal(authenticated.status, 200);
    const identity = await authenticated.json();
    assert.equal(identity.authenticated, true);
    assert.equal(identity.user.email, "auth-test@example.test");
    assert.deepEqual(identity.workspaces, []);
    assert.ok(!JSON.stringify(identity).includes("Other tenant"), "la sesión A no debe leer el workspace B");

    const noSessionAutomationList = await fetch(`${baseUrl}/api/automations`);
    assert.equal(noSessionAutomationList.status, 401);
    const otherCookie = `varino_session=${otherSessionToken}`;
    const otherTenantList = await fetch(`${baseUrl}/api/automations`, { headers: { cookie: otherCookie } });
    assert.equal(otherTenantList.status, 200);
    const otherTenantDrafts = await otherTenantList.json();
    assert.equal(otherTenantDrafts.automations.length, 1);
    assert.equal(otherTenantDrafts.automations[0].name, "B confidential draft");
    const missingWorkspaceList = await fetch(`${baseUrl}/api/automations?workspaceId=${otherWorkspaceId}`, { headers: { cookie } });
    assert.equal(missingWorkspaceList.status, 409);
    assert.ok(!(await missingWorkspaceList.text()).includes("B confidential draft"));

    const createWorkspace = (name, origin = baseUrl) => fetch(`${baseUrl}/api/workspaces`, {
      method: "POST",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    assert.equal((await createWorkspace("no autorizado", "https://attacker.invalid")).status, 403);
    assert.equal((await createWorkspace("x".repeat(5000))).status, 413);
    const injectedWorkspace = await fetch(`${baseUrl}/api/workspaces`, {
      method: "POST",
      headers: { cookie, origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify({ name: "Ataque", workspace_id: otherWorkspaceId }),
    });
    assert.equal(injectedWorkspace.status, 400, "el cliente no puede elegir el workspace de destino");

    const simultaneous = await Promise.all([
      createWorkspace("Equipo Autopilot A"),
      createWorkspace("Equipo Autopilot B"),
    ]);
    const workspaceResults = await Promise.all(simultaneous.map(async (response) => ({ status: response.status, body: await response.json() })));
    assert.ok(workspaceResults.every((item) => item.status === 200 || item.status === 201), JSON.stringify(workspaceResults));
    const workspaceIds = new Set(workspaceResults.map((item) => item.body.workspace.id));
    assert.equal(workspaceIds.size, 1, "dos inicializaciones concurrentes no deben crear workspaces duplicados");
    assert.ok(workspaceResults.some((item) => item.body.created === true));
    assert.ok(workspaceResults.some((item) => item.body.created === false));

    const workspaceListing = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
    const workspaceSession = await workspaceListing.json();
    assert.equal(workspaceSession.workspaces.length, 1);
    assert.equal(workspaceSession.workspaces[0].role, "OWNER");

    const automationUrl = `${baseUrl}/api/automations`;
    const safePlan = {
      schemaVersion: 1,
      name: "Resumen manual de solicitudes",
      objective: "Preparar un resumen manual de solicitudes entrantes para revisión del equipo.",
      trigger: { kind: "manual" },
      requiredIntegrations: [],
      steps: [{ id: "resumir-solicitudes", kind: "summarize", instruction: "Resume solo el texto que la persona aporte manualmente; no lo envíes ni modifiques datos." }],
    };
    const postDraft = (plan, key = randomUUID(), origin = baseUrl, headers = {}) => fetch(automationUrl, {
      method: "POST",
      headers: { cookie, origin, "content-type": "application/json", "idempotency-key": key, ...headers },
      body: JSON.stringify({ plan }),
    });
    assert.equal((await postDraft(safePlan, randomUUID(), "https://attacker.invalid")).status, 403);
    assert.equal((await fetch(automationUrl, { method: "POST", headers: { cookie, origin: baseUrl, "content-type": "text/plain" }, body: "{}" })).status, 415);
    assert.equal((await postDraft({ ...safePlan, extra: "workspace_id" })).status, 400);
    assert.equal((await postDraft({ ...safePlan, objective: "Contacta a maria@example.test" })).status, 400);
    assert.equal((await postDraft(safePlan, "")).status, 400, "la creación debe exigir clave de idempotencia");

    const draftKey = randomUUID();
    const createdDraftResponse = await postDraft(safePlan, draftKey);
    assert.equal(createdDraftResponse.status, 201);
    const createdDraft = await createdDraftResponse.json();
    assert.equal(createdDraft.created, true);
    assert.equal(createdDraft.automation.status, "draft");
    assert.equal(createdDraft.automation.riskLevel, "low");
    assert.equal(createdDraft.automation.approvalRequired, false);
    assert.equal(createdDraft.automation.executable, false);
    assert.deepEqual(createdDraft.automation.plan, safePlan);

    const duplicateDraftResponse = await postDraft(safePlan, draftKey);
    assert.equal(duplicateDraftResponse.status, 200);
    const duplicateDraft = await duplicateDraftResponse.json();
    assert.equal(duplicateDraft.created, false);
    assert.equal(duplicateDraft.automation.id, createdDraft.automation.id);

    const conflictingPlan = { ...safePlan, objective: "Preparar un resumen diferente para revisión del equipo." };
    assert.equal((await postDraft(conflictingPlan, draftKey)).status, 409, "una clave repetida no puede cambiar el contenido");

    const highRiskPlan = {
      schemaVersion: 1,
      name: "Respuesta pendiente de aprobación",
      objective: "Preparar un borrador de respuesta comercial para que el propietario lo revise.",
      trigger: { kind: "manual" },
      requiredIntegrations: ["gmail"],
      steps: [{ id: "preparar-respuesta", kind: "send_email", integration: "gmail", recipientMode: "workspace_contact", instruction: "Solo proponer el texto; no enviarlo sin aprobación humana." }],
    };
    const highRiskResponse = await postDraft(highRiskPlan, randomUUID());
    assert.equal(highRiskResponse.status, 201);
    const highRiskDraft = await highRiskResponse.json();
    assert.equal(highRiskDraft.automation.riskLevel, "high");
    assert.equal(highRiskDraft.automation.approvalRequired, true);
    assert.equal(highRiskDraft.automation.executable, false);

    const isolatedListResponse = await fetch(`${automationUrl}?workspaceId=${otherWorkspaceId}`, { headers: { cookie } });
    assert.equal(isolatedListResponse.status, 200);
    const isolatedList = await isolatedListResponse.json();
    assert.equal(isolatedList.automations.length, 2);
    assert.ok(!JSON.stringify(isolatedList).includes("B confidential draft"));

    const invalidPlan = { plan: { ...safePlan, steps: [{ id: "execute-shell", kind: "shell", instruction: "Run an arbitrary shell command." }] } };
    const rateStatuses = [];
    for (let index = 0; index < 16; index += 1) {
      const response = await fetch(automationUrl, {
        method: "POST",
        headers: { cookie: otherCookie, origin: baseUrl, "content-type": "application/json" },
        body: JSON.stringify(invalidPlan),
      });
      rateStatuses.push(response.status);
    }
    assert.deepEqual(rateStatuses.slice(0, 15), Array(15).fill(400));
    assert.equal(rateStatuses[15], 429, "el límite por usuario debe frenar escrituras repetidas");

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { cookie, origin: baseUrl, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
    const afterLogout = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
    assert.equal(afterLogout.status, 401);

    const integrity = runWrangler([
      "d1", "execute", "VARINO_DB", ...localOnly, "--json", "--command",
      `SELECT (SELECT count(*) FROM workspaces WHERE id IN (SELECT workspace_id FROM workspace_members WHERE user_id = '${userId}')) AS workspaces, (SELECT count(*) FROM automations WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = '${userId}')) AS owner_drafts, (SELECT count(*) FROM automation_versions WHERE automation_id IN (SELECT id FROM automations WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = '${userId}'))) AS owner_versions, (SELECT count(*) FROM approvals WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = '${userId}')) AS owner_approvals, (SELECT count(*) FROM workflow_runs WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = '${userId}')) AS owner_runs, (SELECT count(*) FROM audit_events WHERE actor_user_id = '${userId}' AND action = 'workspace.created') AS workspace_audits, (SELECT count(*) FROM audit_events WHERE actor_user_id = '${userId}' AND action = 'automation.draft.created') AS draft_audits, (SELECT count(*) FROM sessions WHERE id = '${sessionId}' AND revoked_at IS NOT NULL) AS revoked_sessions, (SELECT count(*) FROM sessions WHERE token_hash = '${tokenHash}') AS hashed_sessions, (SELECT request_count FROM api_rate_limits WHERE user_id = '${otherUserId}' AND action = 'automation.draft.create') AS rate_count, (SELECT count(*) FROM pragma_foreign_key_check) AS fk_errors;`,
    ]);
    const checks = JSON.parse(integrity)[0].results[0];
    assert.equal(checks.workspaces, 1);
    assert.equal(checks.owner_drafts, 2);
    assert.equal(checks.owner_versions, 2);
    assert.equal(checks.owner_approvals, 0);
    assert.equal(checks.owner_runs, 0);
    assert.equal(checks.workspace_audits, 1);
    assert.equal(checks.draft_audits, 2);
    assert.equal(checks.revoked_sessions, 1);
    assert.equal(checks.hashed_sessions, 1);
    assert.equal(checks.rate_count, 15);
    assert.equal(checks.fk_errors, 0);
  } finally {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => server.once("exit", resolveExit)),
      new Promise((resolveWait) => setTimeout(resolveWait, 3000)),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }

  process.stdout.write("Pages Functions local: auth, workspace, borradores tenant-isolados, idempotencia, PII guard, rate limit, no-ejecución y logout OK.\n");
} finally {
  rmSync(persistence, { recursive: true, force: true });
}
