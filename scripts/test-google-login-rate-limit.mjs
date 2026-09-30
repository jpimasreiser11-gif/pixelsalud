import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = resolve(projectRoot, "node_modules/wrangler/bin/wrangler.js");
assert.ok(existsSync(wrangler), "Instala las dependencias con npm ci antes de probar Pages Functions.");
assert.ok(existsSync(resolve(projectRoot, "dist/app/index.html")), "Ejecuta npm run build antes de probar Pages Functions.");

const persistence = mkdtempSync(join(tmpdir(), "varino-google-login-limit-"));
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

function startServer(baseUrl) {
  const server = spawn(process.execPath, [
    wrangler,
    "pages", "dev", "dist", "--local", "--port", new URL(baseUrl).port, "--persist-to", persistence,
    "--compatibility-date", "2026-09-28",
    "--binding", `APP_BASE_URL=${baseUrl}`,
    "--binding", "GOOGLE_CLIENT_ID=local-rate-limit-test.apps.googleusercontent.com",
    "--binding", "GOOGLE_CLIENT_SECRET=test-only-not-a-real-secret",
    "--binding", "OAUTH_STATE_SECRET=local-test-secret-with-at-least-32-bytes",
    "--show-interactive-dev-session", "false",
    "--log-level", "error",
  ], { cwd: projectRoot, env: environment, stdio: ["ignore", "pipe", "pipe"] });
  server.output = "";
  const keepTail = (chunk) => { server.output = `${server.output}${chunk}`.slice(-4000); };
  server.stdout.setEncoding("utf8").on("data", keepTail);
  server.stderr.setEncoding("utf8").on("data", keepTail);
  return server;
}

async function waitForServer(server, url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Wrangler terminó antes de servir: ${server.output}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.status === 401) return;
    } catch { /* el servidor todavía está iniciando */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(`Pages Functions no respondió a tiempo: ${server.output}`);
}

async function stopServer(server) {
  if (server.exitCode !== null) return;
  const stopped = new Promise((resolveExit) => server.once("exit", resolveExit));
  server.kill("SIGTERM");
  await Promise.race([stopped, new Promise((resolveWait) => setTimeout(resolveWait, 3000))]);
  if (server.exitCode === null) {
    const killed = new Promise((resolveExit) => server.once("exit", resolveExit));
    server.kill("SIGKILL");
    await killed;
  }
}

let server;
try {
  const localOnly = ["--local", "--persist-to", persistence];
  runWrangler(["d1", "migrations", "apply", "VARINO_DB", ...localOnly]);

  const baseUrl = `http://127.0.0.1:${await unusedPort()}`;
  const startUrl = `${baseUrl}/api/auth/google/start`;
  const startLogin = (ip) => fetch(startUrl, {
    method: "POST",
    headers: { origin: baseUrl, "content-type": "application/json", "cf-connecting-ip": ip },
    body: "{}",
    signal: AbortSignal.timeout(5000),
  });

  server = startServer(baseUrl);
  await waitForServer(server, `${baseUrl}/api/auth/session`);

  const localLoopback = await fetch(startUrl, {
    method: "POST",
    headers: { origin: baseUrl, "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(localLoopback.status, 200, "la prueba local debe aceptar solo el loopback del origen local explícito");

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await startLogin("203.0.113.10");
    assert.equal(response.status, 200, `intento ${attempt} del mismo IP debe permitir inicio de sesión`);
    const body = await response.json();
    const authorizationUrl = new URL(body.authorizationUrl);
    assert.equal(authorizationUrl.origin, "https://accounts.google.com");
    assert.equal(authorizationUrl.searchParams.get("scope"), "openid email profile");
    assert.match(response.headers.get("set-cookie") ?? "", /varino_oauth_state=/);
  }

  await stopServer(server);
  server = undefined;
  server = startServer(baseUrl);
  await waitForServer(server, `${baseUrl}/api/auth/session`);

  const persistedLimit = await startLogin("203.0.113.10");
  assert.equal(persistedLimit.status, 429, "el límite debe persistir al reiniciar Pages Functions");
  assert.equal((await persistedLimit.json()).error, "rate_limited");
  const retryAfter = Number(persistedLimit.headers.get("retry-after"));
  assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 900);

  const anotherClient = await startLogin("203.0.113.11");
  assert.equal(anotherClient.status, 200, "el límite de un visitante no debe bloquear a otro IP");
  const invalidClient = await startLogin("not-an-ip");
  assert.equal(invalidClient.status, 503, "un identificador de cliente inválido debe fallar cerrado");
  assert.deepEqual(await invalidClient.json(), { error: "rate_limit_unavailable" });

  const rowsOutput = runWrangler([
    "d1", "execute", "VARINO_DB", ...localOnly, "--json", "--command",
    "SELECT bucket_hash, request_count, expires_at FROM google_login_start_rate_limits ORDER BY request_count;",
  ]);
  const rows = JSON.parse(rowsOutput.trim())[0].results;
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.request_count).sort((a, b) => a - b), [1, 1, 5]);
  assert.ok(rows.every((row) => /^[a-f0-9]{64}$/.test(row.bucket_hash)));
  assert.ok(rows.every((row) => !JSON.stringify(row).includes("203.0.113.")));

  process.stdout.write("Google login local: 5/15 min por IP, 429 + Retry-After, aislamiento por visitante, fallo cerrado y persistencia tras reinicio OK; IP sin guardar; sin llamadas a Google.\n");
} finally {
  if (server) await stopServer(server);
  rmSync(persistence, { recursive: true, force: true });
}
