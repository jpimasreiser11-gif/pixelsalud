import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = resolve(projectRoot, "node_modules/wrangler/bin/wrangler.js");
assert.ok(existsSync(wrangler), "Instala las dependencias con npm ci antes de probar Pages Functions.");
assert.ok(existsSync(resolve(projectRoot, "dist/app/index.html")), "Ejecuta npm run build antes de probar Pages Functions.");

const persistence = mkdtempSync(join(tmpdir(), "varino-google-login-limit-"));
const fixtureRoot = join(persistence, "fixture");
const initialTime = 1_800_000_010;
const windowEnd = 1_800_000_900;
const limiterSource = readFileSync(resolve(projectRoot, "functions/_lib/http.ts"), "utf8");
const clockAnchor = `export async function consumeGoogleLoginStartLimit(
  request: Request,
  env: AuthEnvironment,
  now = Math.floor(Date.now() / 1000),
): Promise<GoogleLoginStartLimitDecision> {`;
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

function prepareFixture() {
  assert.equal(limiterSource.split(clockAnchor).length, 2, "revisar el fixture si cambia la firma del limitador");
  cpSync(resolve(projectRoot, "functions"), join(fixtureRoot, "functions"), { recursive: true });
  cpSync(resolve(projectRoot, "wrangler.jsonc"), join(fixtureRoot, "wrangler.jsonc"));
  for (const directory of ["src", "dist", "migrations", "node_modules"]) {
    symlinkSync(resolve(projectRoot, directory), join(fixtureRoot, directory), "dir");
  }
}

function startServer(baseUrl, fixtureTime) {
  // Only this disposable copy receives a fixed default clock. No production
  // binding, header, route, quota or SQL is changed. Fixing time across restarts
  // avoids mistaking a legitimate 15-minute rollover for lost D1 persistence.
  assert.ok(Number.isSafeInteger(fixtureTime) && fixtureTime > 0);
  writeFileSync(join(fixtureRoot, "functions/_lib/http.ts"), limiterSource.replace(
    clockAnchor,
    clockAnchor.replace("Math.floor(Date.now() / 1000)", String(fixtureTime)),
  ));
  const server = spawn(process.execPath, [
    wrangler,
    "pages", "dev", "dist", "--local", "--ip", "127.0.0.1", "--port", new URL(baseUrl).port, "--persist-to", persistence,
    "--compatibility-date", "2026-09-28",
    "--binding", `APP_BASE_URL=${baseUrl}`,
    "--binding", "GOOGLE_CLIENT_ID=local-rate-limit-test.apps.googleusercontent.com",
    "--binding", "GOOGLE_CLIENT_SECRET=test-only-not-a-real-secret",
    "--binding", "OAUTH_STATE_SECRET=local-test-secret-with-at-least-32-bytes",
    "--show-interactive-dev-session", "false",
    "--log-level", "error",
  ], { cwd: fixtureRoot, env: environment, stdio: ["ignore", "pipe", "pipe"] });
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
  prepareFixture();
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

  server = startServer(baseUrl, initialTime);
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
  server = startServer(baseUrl, windowEnd - 1);
  await waitForServer(server, `${baseUrl}/api/auth/session`);

  const persistedLimit = await startLogin("203.0.113.10");
  assert.equal(persistedLimit.status, 429, "el límite debe persistir al reiniciar Pages Functions");
  assert.equal((await persistedLimit.json()).error, "rate_limited");
  const retryAfter = Number(persistedLimit.headers.get("retry-after"));
  assert.equal(retryAfter, 1, "el último segundo de la ventana sigue bloqueado, incluso tras reiniciar");

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
  assert.ok(rows.every((row) => row.expires_at === windowEnd));

  await stopServer(server);
  server = undefined;
  server = startServer(baseUrl, windowEnd);
  await waitForServer(server, `${baseUrl}/api/auth/session`);

  const nextWindow = await startLogin("203.0.113.10");
  assert.equal(nextWindow.status, 200, "al caducar la ventana debe permitir un nuevo inicio, no mantener el bloqueo anterior");
  const resetOutput = runWrangler([
    "d1", "execute", "VARINO_DB", ...localOnly, "--json", "--command",
    "SELECT bucket_hash, request_count, expires_at FROM google_login_start_rate_limits;",
  ]);
  const resetRows = JSON.parse(resetOutput.trim())[0].results;
  assert.equal(resetRows.length, 1, "las tres ventanas vencidas se eliminan antes de contar el nuevo intento");
  assert.equal(resetRows[0].request_count, 1);
  assert.equal(resetRows[0].expires_at, windowEnd + 900);
  assert.match(resetRows[0].bucket_hash, /^[a-f0-9]{64}$/);
  assert.ok(rows.every((row) => row.bucket_hash !== resetRows[0].bucket_hash));
  assert.equal(readFileSync(resolve(projectRoot, "functions/_lib/http.ts"), "utf8"), limiterSource, "el código de producción no debe modificarse por el ensayo");

  process.stdout.write("Google login local: 5/15 min por IP, persistencia al reiniciar hasta el último segundo, 429 + Retry-After=1 y reset exacto al caducar OK; D1 real con reloj solo en copia temporal, IP sin guardar; sin llamadas a Google.\n");
} finally {
  if (server) await stopServer(server);
  rmSync(persistence, { recursive: true, force: true });
}
