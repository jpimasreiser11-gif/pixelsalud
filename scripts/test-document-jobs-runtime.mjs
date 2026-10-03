import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { DOCUMENT_KEYS } from '../src/lib/autopilot/document-contract.mjs';
import { workerConfiguration, runDocumentWorkerOnce } from './local-document-worker.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
assert.ok(existsSync(resolve(root, 'dist/app/index.html')), 'Build the app before testing.');
const persistence = mkdtempSync(join(tmpdir(), 'varino-document-jobs-'));
const environment = { PATH: process.env.PATH, HOME: process.env.HOME, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' };
const localOnly = ['--local', '--persist-to', persistence];
const sql = (command) => {
  const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'VARINO_DB', ...localOnly, '--command', command], { cwd: root, env: environment, encoding: 'utf8', maxBuffer: 2e6 });
  assert.equal(result.status, 0, 'Local D1 test setup failed.');
};
async function unusedPort() {
  const listener = createServer();
  await new Promise((done) => listener.listen(0, '127.0.0.1', done));
  const port = listener.address().port;
  await new Promise((done) => listener.close(done));
  return port;
}
const hash = (token) => createHash('sha256').update(token).digest('hex');
const user = randomUUID(); const other = randomUUID();
const workspace = randomUUID(); const otherWorkspace = randomUUID();
const sessionToken = randomBytes(32).toString('base64url');
const otherToken = randomBytes(32).toString('base64url');
const workerToken = randomBytes(32).toString('base64url');
const n8nToken = randomBytes(32).toString('base64url');
const result = {
  ok: true, status: 'draft_human_review_required', model: 'qwen3.6:27b',
  documents: Object.fromEntries(DOCUMENT_KEYS.map((key) => [key, `# ${key}\n${'Propuesta por confirmar. '.repeat(10)}BORRADOR · REVISIÓN HUMANA OBLIGATORIA`])),
  preguntas_pendientes: ['¿Qué proceso se revisará?', '¿Qué entradas están disponibles?', '¿Quién validará la propuesta?'],
  side_effects: false, stored: false, sent: false, implemented: false,
};
let server; let n8nFixture;
const port = await unusedPort();
const base = `http://127.0.0.1:${port}`;
async function start() {
  server = spawn(process.execPath, [wrangler, 'pages', 'dev', 'dist', '--local', '--port', String(port), '--persist-to', persistence,
    '--binding', `APP_BASE_URL=${base}`, '--binding', `AGENCY_WORKSPACE_ID=${workspace}`,
    '--binding', `DOCUMENT_WORKER_TOKEN_HASH=${hash(workerToken)}`, '--show-interactive-dev-session', 'false', '--log-level', 'error'],
  { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  // Never echo subprocess args, session cookies or authentication material.
  server.stdout.resume(); server.stderr.resume();
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (server.exitCode !== null) throw new Error('Local Pages server stopped.');
    try { if ((await fetch(`${base}/api/auth/session`, { signal: AbortSignal.timeout(1000) })).status === 401) return; } catch { /* startup */ }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error('Local Pages server timed out.');
}
async function stop() {
  if (server && server.exitCode === null) { const exited = new Promise((done) => server.once('exit', done)); server.kill('SIGTERM'); await exited; }
}
try {
  const migrated = spawnSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'VARINO_DB', ...localOnly], { cwd: root, env: environment, encoding: 'utf8' });
  assert.equal(migrated.status, 0, 'Local D1 migration failed.');
  const now = Math.floor(Date.now() / 1000);
  sql(`INSERT INTO users (id,email,status,created_at,updated_at) VALUES ('${user}','owner@example.test','active',${now},${now}),('${other}','other@example.test','active',${now},${now});
    INSERT INTO sessions(id,user_id,token_hash,issued_at,expires_at) VALUES('${randomUUID()}','${user}','${hash(sessionToken)}',${now},${now + 3600}),('${randomUUID()}','${other}','${hash(otherToken)}',${now},${now + 3600});
    INSERT INTO workspaces(id,name,slug,status,created_at,updated_at) VALUES('${workspace}','Agency fixture','agency-fixture','active',${now},${now}),('${otherWorkspace}','Other fixture','other-fixture','active',${now},${now});
    INSERT INTO workspace_members(workspace_id,user_id,role,status,created_at,updated_at) VALUES('${workspace}','${user}','OWNER','active',${now},${now}),('${otherWorkspace}','${other}','OWNER','active',${now},${now});`);
  await start();
  const ownerHeaders = { cookie: `varino_session=${sessionToken}`, origin: base, 'content-type': 'application/json' };
  const workerHeaders = { authorization: `Bearer ${workerToken}`, 'content-type': 'application/json' };
  const userPost = (body, headers = ownerHeaders) => fetch(`${base}/api/document-jobs`, { method: 'POST', headers, body: JSON.stringify(body) });
  const claim = () => fetch(`${base}/api/jobs/claim`, { method: 'POST', headers: workerHeaders, body: '{}' });
  const report = (job, payload) => fetch(`${base}/api/jobs/result`, { method: 'POST', headers: workerHeaders, body: JSON.stringify({ jobId: job.id, leaseToken: job.leaseToken, ...payload }) });
  const newDraft = async (name) => {
    const response = await fetch(`${base}/api/automations`, { method: 'POST', headers: { ...ownerHeaders, 'idempotency-key': randomUUID() }, body: JSON.stringify({ plan: {
      schemaVersion: 1, name, objective: 'Resumir solicitudes ficticias para revisión por el equipo.', trigger: { kind: 'manual' }, requiredIntegrations: [],
      steps: [{ id: 'resumen-manual', kind: 'summarize', instruction: 'Resume solo texto ficticio. No envíes ni implementes nada.' }],
    } }) });
    assert.equal(response.status, 201); return (await response.json()).automation;
  };
  assert.equal((await fetch(`${base}/api/document-jobs`)).status, 401);
  assert.equal((await fetch(`${base}/api/document-jobs`, { headers: { cookie: `varino_session=${otherToken}` } })).status, 403);
  assert.equal((await userPost({ automationId: randomUUID() }, { ...ownerHeaders, origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await userPost({ automationId: randomUUID(), brief: 'user cannot choose input' })).status, 400);
  assert.equal((await userPost({ automationId: randomUUID() })).status, 404);
  assert.equal((await fetch(`${base}/api/jobs/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await fetch(`${base}/api/jobs/claim`, { method: 'POST', headers: { ...workerHeaders, origin: base }, body: '{}' })).status, 401);
  assert.equal((await fetch(`${base}/api/jobs/claim`, { method: 'POST', headers: workerHeaders, body: JSON.stringify({ kind: 'send_email' }) })).status, 400);

  const draft = await newDraft('Paquete ficticio uno');
  const enqueued = await Promise.all([userPost({ automationId: draft.id }), userPost({ automationId: draft.id })]);
  assert.deepEqual(enqueued.map((response) => response.status).sort(), [200, 201]);
  const created = await Promise.all(enqueued.map((response) => response.json()));
  assert.equal(created[0].job.id, created[1].job.id);
  const claimed = await Promise.all([claim(), claim()]);
  const claims = await Promise.all(claimed.map((response) => response.json()));
  assert.equal(claims.filter((item) => item.job).length, 1, 'Atomic claim must assign one job to one worker.');
  const first = claims.find((item) => item.job).job;
  assert.equal((await report({ ...first, leaseToken: 'x'.repeat(43) }, { result })).status, 409);
  assert.equal((await report(first, { result: { ...result, sent: true } })).status, 400);
  assert.equal((await report(first, { result: { ...result, documents: { ...result.documents, prd: `${result.documents.prd} maria@example.test` } } })).status, 400);
  const completed = await report(first, { result });
  assert.equal(completed.status, 200); assert.equal((await completed.json()).status, 'completed');
  const replay = await report(first, { result });
  assert.equal((await replay.json()).duplicate, true);
  assert.equal((await report(first, { errorCode: 'local_unavailable' })).status, 409);
  assert.equal((await (await claim()).json()).job, null);

  const retryDraft = await newDraft('Paquete ficticio reintentos');
  const retryJob = (await (await userPost({ automationId: retryDraft.id })).json()).job;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const job = (await (await claim()).json()).job;
    assert.equal(job.attempt, attempt);
    const failure = await report(job, { errorCode: 'local_unavailable' });
    const failureBody = await failure.json();
    assert.equal(failureBody.status, attempt === 3 ? 'manual_review' : 'pending');
    assert.equal((await (await report(job, { errorCode: 'local_unavailable' })).json()).duplicate, true);
    assert.equal((await (await claim()).json()).job, null, 'Retry must respect backoff.');
    sql(`UPDATE document_jobs SET not_before = 0 WHERE id = '${retryJob.id}';`);
  }

  const leaseDraft = await newDraft('Paquete ficticio recuperación');
  await userPost({ automationId: leaseDraft.id });
  const oldLease = (await (await claim()).json()).job;
  sql(`UPDATE document_jobs SET lease_expires_at = 0 WHERE id = '${oldLease.id}';`);
  await stop(); await start();
  const newLease = (await (await claim()).json()).job;
  assert.equal(newLease.id, oldLease.id); assert.equal(newLease.attempt, 2);
  assert.notEqual(newLease.leaseToken, oldLease.leaseToken);
  assert.equal((await report(oldLease, { result })).status, 409);
  assert.equal((await report(newLease, { result })).status, 200);
  const saved = await (await fetch(`${base}/api/document-jobs`, { headers: ownerHeaders })).json();
  assert.equal(saved.jobs.filter((job) => job.status === 'completed').length, 2);
  assert.deepEqual(saved.jobs.find((job) => job.id === first.id).documents, result.documents);
  assert.ok(!JSON.stringify(saved).includes('leaseToken') && !JSON.stringify(saved).includes(workerToken));

  const workerDraft = await newDraft('Paquete ficticio trabajador');
  await userPost({ automationId: workerDraft.id });
  let n8nCalls = 0;
  let localPort; let localToken;
  if (process.env.VARINO_TEST_N8N_PORT && process.env.VARINO_TEST_N8N_TOKEN) {
    localPort = process.env.VARINO_TEST_N8N_PORT; localToken = process.env.VARINO_TEST_N8N_TOKEN;
  } else {
    n8nFixture = createServer((request, response) => {
      n8nCalls += 1;
      assert.equal(request.url, '/webhook/document-pack-draft');
      assert.equal(request.headers['x-varino-document-key'], n8nToken);
      let data = ''; request.on('data', (chunk) => { data += chunk; });
      request.on('end', () => {
        assert.deepEqual(Object.keys(JSON.parse(data)), ['brief']);
        response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(result));
      });
    });
    await new Promise((done) => n8nFixture.listen(0, '127.0.0.1', done));
    localPort = String(n8nFixture.address().port); localToken = n8nToken;
  }
  const workerConfig = workerConfiguration({ VARINO_CONTROL_URL: base, VARINO_DOCUMENT_WORKER_TOKEN: workerToken, VARINO_N8N_PORT: localPort, VARINO_N8N_DOCUMENT_TOKEN: localToken });
  const worked = await runDocumentWorkerOnce(workerConfig);
  assert.equal(worked.status, 'completed', `Worker returned ${worked.status}; no delivery confirmed.`);
  if (n8nFixture) assert.equal(n8nCalls, 1);
  const delivered = await (await fetch(`${base}/api/document-jobs`, { headers: ownerHeaders })).json();
  assert.equal(delivered.jobs.find((job) => job.id === worked.jobId).status, 'completed');
  // A real browser against the real local API, not intercepted routes or an OAuth bypass.
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies([{ name: 'varino_session', value: sessionToken, url: base, httpOnly: true, sameSite: 'Lax' }]);
    const page = await context.newPage();
    await page.goto(`${base}/app/`);
    await page.getByRole('heading', { name: 'Taller documental de la agencia' }).waitFor();
    const packageView = page.locator('#document-jobs-list > li').filter({ hasText: 'Paquete ficticio trabajador' });
    await packageView.getByText('Listos para revisión humana', { exact: true }).waitFor();
    assert.equal(await packageView.locator('details').count(), 6);
    await packageView.getByText('Diagnóstico CAIO', { exact: true }).click();
    assert.match(await packageView.locator('pre').first().textContent(), /REVISIÓN HUMANA OBLIGATORIA/);
    assert.equal(await packageView.locator('img, iframe, script').count(), 0);
    if (process.env.VARINO_TEST_SCREENSHOT) await page.screenshot({ path: process.env.VARINO_TEST_SCREENSHOT, fullPage: true });
    await context.close();
  } finally { await browser.close(); }
  console.log('PASS: real local Pages/D1 requests; agency-only access, CSRF, atomic claim, deduplication, output rejection, backoff, three-attempt stop and recovery after restart.');
  console.log('PASS: real browser and authenticated local API display the six saved drafts without HTML interpretation.');
  console.log(n8nFixture ? 'PASS: worker transport through an HTTP n8n stub (no real inference in this mode).' : 'PASS: worker → authenticated isolated n8n → local Qwen → D1 delivery, synthetic brief only.');
} finally {
  await stop();
  if (n8nFixture) await new Promise((done) => n8nFixture.close(done));
  assert.ok(persistence.startsWith(join(tmpdir(), 'varino-document-jobs-')));
  rmSync(persistence, { recursive: true, force: true });
}
