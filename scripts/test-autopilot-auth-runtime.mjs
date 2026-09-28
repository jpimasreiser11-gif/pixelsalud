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
    const now = Math.floor(Date.now() / 1000);
    const sql = `INSERT INTO users (id, email, google_subject, email_verified_at, status, created_at, updated_at)
      VALUES ('${userId}', 'auth-test@example.test', 'google-sub-auth-test', ${now}, 'active', ${now}, ${now});
      INSERT INTO users (id, email, google_subject, email_verified_at, status, created_at, updated_at)
      VALUES ('${otherUserId}', 'other-auth-test@example.test', 'google-sub-other-test', ${now}, 'active', ${now}, ${now});
      INSERT INTO sessions (id, user_id, token_hash, issued_at, expires_at)
      VALUES ('${sessionId}', '${userId}', '${tokenHash}', ${now}, ${now + 3600});
      INSERT INTO workspaces (id, name, slug, status, created_at, updated_at)
      VALUES ('${otherWorkspaceId}', 'Other tenant', 'other-tenant-test', 'active', ${now}, ${now});
      INSERT INTO workspace_members (workspace_id, user_id, role, status, created_at, updated_at)
      VALUES ('${otherWorkspaceId}', '${otherUserId}', 'OWNER', 'active', ${now}, ${now});`;
    runWrangler(["d1", "execute", "VARINO_DB", ...localOnly, "--command", sql]);
    const cookie = `varino_session=${sessionToken}`;

    const authenticated = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
    assert.equal(authenticated.status, 200);
    const identity = await authenticated.json();
    assert.equal(identity.authenticated, true);
    assert.equal(identity.user.email, "auth-test@example.test");
    assert.deepEqual(identity.workspaces, []);
    assert.ok(!JSON.stringify(identity).includes("Other tenant"), "la sesión A no debe leer el workspace B");

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
    assert.ok(workspaceResults.every((item) => item.status === 200 || item.status === 201));
    const workspaceIds = new Set(workspaceResults.map((item) => item.body.workspace.id));
    assert.equal(workspaceIds.size, 1, "dos inicializaciones concurrentes no deben crear workspaces duplicados");
    assert.ok(workspaceResults.some((item) => item.body.created === true));
    assert.ok(workspaceResults.some((item) => item.body.created === false));

    const workspaceListing = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
    const workspaceSession = await workspaceListing.json();
    assert.equal(workspaceSession.workspaces.length, 1);
    assert.equal(workspaceSession.workspaces[0].role, "OWNER");

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
      `SELECT (SELECT count(*) FROM workspaces WHERE id IN (SELECT workspace_id FROM workspace_members WHERE user_id = '${userId}')) AS workspaces, (SELECT count(*) FROM audit_events WHERE actor_user_id = '${userId}' AND action = 'workspace.created') AS audit_events, (SELECT count(*) FROM sessions WHERE id = '${sessionId}' AND revoked_at IS NOT NULL) AS revoked_sessions, (SELECT count(*) FROM sessions WHERE token_hash = '${tokenHash}') AS hashed_sessions, (SELECT count(*) FROM pragma_foreign_key_check) AS fk_errors;`,
    ]);
    const checks = JSON.parse(integrity)[0].results[0];
    assert.deepEqual(checks, { workspaces: 1, audit_events: 1, revoked_sessions: 1, hashed_sessions: 1, fk_errors: 0 });
  } finally {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => server.once("exit", resolveExit)),
      new Promise((resolveWait) => setTimeout(resolveWait, 3000)),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }

  process.stdout.write("Pages Functions local: auth fail-closed, session hash, workspace/idempotencia, CSRF y logout/revocación OK.\n");
} finally {
  rmSync(persistence, { recursive: true, force: true });
}
