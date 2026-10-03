import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { missingResponseSecurityHeaders } from "../src/lib/response-security-headers.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const wranglerPackagePath = require.resolve("wrangler/package.json");
const wranglerPackage = JSON.parse(await readFile(wranglerPackagePath, "utf8"));
const wranglerBin = resolve(dirname(wranglerPackagePath), wranglerPackage.bin.wrangler);

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string", "port probe did not return a TCP address");
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolveExit) => child.once("exit", resolveExit));
}

function stopChild(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

const port = await availablePort();
const persistence = await mkdtemp(join(tmpdir(), "varino-pages-runtime-"));
const child = spawn(process.execPath, [
  wranglerBin,
  "pages", "dev", "dist",
  "--local",
  "--ip", "127.0.0.1",
  "--port", String(port),
  "--persist-to", persistence,
  "--log-level", "none",
], {
  cwd: root,
  detached: process.platform !== "win32",
  env: { ...process.env, NO_COLOR: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let logs = "";
let spawnError;
child.stdout.on("data", (chunk) => { logs = (logs + chunk.toString()).slice(-3000); });
child.stderr.on("data", (chunk) => { logs = (logs + chunk.toString()).slice(-3000); });
child.once("error", (error) => { spawnError = error; });

try {
  const origin = `http://127.0.0.1:${port}`;
  let rootResponse;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Wrangler Pages exited before becoming ready.\n${logs}`);
    }
    try {
      const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(1_000) });
      if (response.status === 200) {
        rootResponse = response;
        break;
      }
    } catch {
      // The server may need a short start-up window after Wrangler compiles functions.
    }
    await delay(250);
  }

  assert.ok(rootResponse, `Wrangler Pages did not serve the home page in time.\n${logs}`);
  assert.match(rootResponse.headers.get("content-type") ?? "", /text\/html/i);
  assert.deepEqual(missingResponseSecurityHeaders(rootResponse.headers), [], "Pages preview omitted required response security headers");

  const apiResponse = await fetch(`${origin}/api/automations`, { signal: AbortSignal.timeout(5_000) });
  assert.equal(apiResponse.status, 401, "automation API must reject unauthenticated requests");
  assert.match(apiResponse.headers.get("cache-control") ?? "", /no-store/i);
  assert.deepEqual(await apiResponse.json(), { error: "unauthenticated" });

  console.log("Pages local runtime OK: build served, response security headers present, unauthenticated API rejected, isolated D1 state.");
} finally {
  if (child.pid && child.exitCode === null && child.signalCode === null) {
    stopChild(child, "SIGTERM");
    const stopped = await Promise.race([waitForExit(child).then(() => true), delay(5_000).then(() => false)]);
    if (!stopped) {
      stopChild(child, "SIGKILL");
      await waitForExit(child);
    }
  }
  await rm(persistence, { recursive: true, force: true });
}
