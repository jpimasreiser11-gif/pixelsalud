import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { checkDurableSuppression, runSuppressionWorkerOnce, suppressionWorkerConfiguration } from './local-suppression-worker.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
assert.ok(existsSync(resolve(root, 'dist/baja/index.html')), 'Build the site first.');
const persistence = mkdtempSync(join(tmpdir(), 'varino-suppression-http-'));
const environment = { PATH: process.env.PATH, HOME: process.env.HOME, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' };
const localOnly = ['--local', '--persist-to', persistence];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const workspace = randomUUID();
const issuer = randomBytes(32).toString('base64url');
const sync = randomBytes(32).toString('base64url');
const check = randomBytes(32).toString('base64url');
const privacy = randomBytes(32).toString('base64url');
const n8nToken = randomBytes(32).toString('base64url');
const sql = (command) => {
  const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'VARINO_DB', ...localOnly, '--command', command, '--json'],
    { cwd: root, env: environment, encoding: 'utf8', maxBuffer: 2e6 });
  assert.equal(result.status, 0, 'Local D1 operation failed (output withheld).');
  return JSON.parse(result.stdout)[0]?.results ?? [];
};
const temporaryListener = createServer();
await new Promise((done) => temporaryListener.listen(0, '127.0.0.1', done));
const port = temporaryListener.address().port;
await new Promise((done) => temporaryListener.close(done));
const base = 'http://127.0.0.1:' + port;
let pages; let browser; let stub; let nativePosts = 0; let ambiguous = false;
const post = (path, body, token, extra = {}) => fetch(base + path, { method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : { origin: base }), ...extra },
  body: JSON.stringify(body) });
const issue = async (email) => {
  const response = await post('/api/unsubscribe/issue', { email }, issuer);
  assert.equal(response.status, 201);
  const { unsubscribeUrl } = await response.json();
  const url = new URL(unsubscribeUrl);
  assert.equal(url.origin, base); assert.equal(url.pathname, '/baja/'); assert.equal(url.search, '');
  assert.ok(!unsubscribeUrl.includes(email) && !unsubscribeUrl.includes(encodeURIComponent(email)));
  return { url: unsubscribeUrl, token: new URLSearchParams(url.hash.slice(1)).get('token') };
};
const confirm = (token, extra) => post('/api/unsubscribe', { token }, null, extra);
const blocked = async (email) => checkDurableSuppression({ base, checkToken: check }, email);
async function assertAccessible(page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  assert.deepEqual(violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) })), []);
}
async function start(enabled = true) {
  pages = spawn(process.execPath, [wrangler, 'pages', 'dev', 'dist', '--local', '--port', String(port), '--persist-to', persistence,
    '--binding', 'APP_BASE_URL=' + base, '--binding', 'AGENCY_WORKSPACE_ID=' + workspace,
    '--binding', 'UNSUBSCRIBE_MODE=local-test', '--binding', 'UNSUBSCRIBE_ISSUANCE_ENABLED=' + (enabled ? '1' : '0'),
    '--binding', 'UNSUBSCRIBE_ISSUER_TOKEN_HASH=' + hash(issuer), '--binding', 'UNSUBSCRIBE_SYNC_TOKEN_HASH=' + hash(sync),
    '--binding', 'SUPPRESSION_CHECK_TOKEN_HASH=' + hash(check), '--binding', 'SUPPRESSION_PRIVACY_KEY=' + privacy,
    '--show-interactive-dev-session', 'false', '--log-level', 'error'],
  { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  pages.stdout.resume(); pages.stderr.resume();
  for (let attempt = 0; attempt < 150; attempt++) {
    if (pages.exitCode !== null) throw new Error('Local Pages stopped.');
    try { if ((await fetch(base + '/api/unsubscribe', { signal: AbortSignal.timeout(1000) })).status === 405) return; } catch { /* startup */ }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error('Local Pages timed out.');
}
async function stop() {
  if (pages && pages.exitCode === null) { const closed = new Promise((done) => pages.once('exit', done)); pages.kill('SIGTERM'); await closed; }
}
try {
  const migrated = spawnSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'VARINO_DB', ...localOnly],
    { cwd: root, env: environment, encoding: 'utf8' });
  assert.equal(migrated.status, 0, 'Local migration failed.');
  const now = Math.floor(Date.now() / 1000);
  sql("INSERT INTO workspaces(id,name,slug,status,created_at,updated_at) VALUES('" + workspace + "','Suppression fixture','suppression-fixture','active'," + now + ',' + now + ')');
  await start();
  assert.equal((await post('/api/unsubscribe/issue', { email: 'fixture@example.test' }, sync)).status, 401);
  assert.equal((await post('/api/unsubscribe/claim', {}, issuer)).status, 401);
  assert.equal((await post('/api/unsubscribe/maintenance', {}, check)).status, 401);
  assert.equal((await post('/api/unsubscribe/check', { email: 'fixture@example.test' }, issuer)).status, 401);
  assert.equal((await post('/api/unsubscribe/check', { email: 'fixture@example.test' }, check, { origin: base })).status, 401);
  assert.equal((await post('/api/unsubscribe/issue', { email: 'real@example.com' }, issuer)).status, 400);
  assert.equal((await post('/api/unsubscribe/issue', { email: 'fixture@example.test', secret: 'not-allowed' }, issuer)).status, 400);
  assert.equal((await blocked('fixture@example.test')).status, 'clear');
  const link = await issue('FIXTURE+First@example.test');
  const sameRecipient = await issue('fixture+first@example.test');
  assert.equal((await confirm(link.token, { origin: 'https://attacker.test' })).status, 403);
  assert.equal((await confirm(link.token, { origin: '' })).status, 403);
  assert.equal((await confirm(link.token, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await post('/api/unsubscribe', { token: link.token, email: 'fixture@example.test' })).status, 400);
  assert.equal((await confirm('x'.repeat(43))).status, 400);
  const get = await fetch(link.url);
  assert.equal(get.status, 200);
  assert.equal(sql('SELECT count(*) AS n FROM mail_suppressions')[0].n, 0);
  assert.equal((await fetch(base + '/api/unsubscribe?token=' + link.token)).status, 405);
  const confirmations = await Promise.all(Array.from({ length: 6 }, () => confirm(link.token)));
  assert.ok(confirmations.every((response) => response.status === 200));
  for (const response of confirmations) {
    assert.deepEqual(await response.json(), { ok: true, status: 'suppressed' });
    assert.ok(response.headers.get('cache-control').includes('no-store'));
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal((await confirm(sameRecipient.token)).status, 200);
  assert.equal(sql('SELECT count(*) AS n FROM mail_suppressions')[0].n, 1);
  assert.equal(sql('SELECT count(*) AS n FROM suppression_outbox')[0].n, 1);
  assert.equal((await blocked('FIXTURE+FIRST@example.test')).status, 'blocked');
  assert.equal((await blocked('fixturefirst@example.test')).status, 'clear', 'Do not remove dots or + tags.');
  assert.equal((await post('/api/unsubscribe/issue', { email: 'fixture+first@example.test' }, issuer)).status, 409);
  const stored = JSON.stringify(sql('SELECT * FROM unsubscribe_tokens'));
  assert.ok(!stored.includes(link.token) && !stored.includes('fixture+first@example.test'));
  assert.ok(sql('SELECT encrypted_email FROM unsubscribe_tokens').every((row) => row.encrypted_email === null));
  console.log('PASS: real D1/HTTP, no GET mutation, explicit same-origin POST, concurrent single suppression/outbox, opaque links, scoped credentials, no plaintext email/token storage.');

  // A failed outbox insert must roll back the ledger AND token consumption.
  const rollbackLink = await issue('rollback@example.test');
  sql("CREATE TRIGGER qa_outbox_failure BEFORE INSERT ON suppression_outbox BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  assert.equal((await confirm(rollbackLink.token)).status, 503);
  assert.equal((await blocked('rollback@example.test')).status, 'clear');
  assert.equal(sql("SELECT confirmed_at FROM unsubscribe_tokens WHERE token_hash='" + hash(rollbackLink.token) + "'")[0].confirmed_at, null);
  sql('DROP TRIGGER qa_outbox_failure');
  assert.equal((await confirm(rollbackLink.token)).status, 200);
  await stop(); await start(false);
  assert.equal((await blocked('fixture+first@example.test')).status, 'blocked');
  assert.equal((await confirm(link.token)).status, 200);
  assert.equal((await post('/api/unsubscribe/issue', { email: 'disabled@example.test' }, issuer)).status, 503);
  console.log('PASS: atomic rollback on queue failure, durable opposition survives restart, stopping issuance does not disable existing opt-out links.');
  await stop(); await start();

  const claims = await Promise.all([post('/api/unsubscribe/claim', {}, sync), post('/api/unsubscribe/claim', {}, sync)]);
  const jobs = (await Promise.all(claims.map((response) => response.json()))).map((data) => data.job).filter(Boolean);
  assert.equal(jobs.length, 1);
  const job = jobs[0];
  assert.ok(job.email.endsWith('.test'));
  const result = { eventId: job.eventId, leaseToken: job.leaseToken, result: { ok: true, status: 'suppressed', eventId: job.eventId } };
  assert.equal((await post('/api/unsubscribe/result', { ...result, result: { ...result.result, eventId: 'f'.repeat(64) } }, sync)).status, 400);
  const acknowledgements = await Promise.all([post('/api/unsubscribe/result', result, sync), post('/api/unsubscribe/result', result, sync)]);
  assert.ok(acknowledgements.every((response) => response.status === 200));
  assert.deepEqual(sql("SELECT status,encrypted_email FROM suppression_outbox WHERE event_id='" + job.eventId + "'")[0], { status: 'synced', encrypted_email: null });
  assert.equal((await post('/api/unsubscribe/result', { eventId: job.eventId, leaseToken: job.leaseToken, errorCode: 'crm_unconfirmed' }, sync)).status, 409);
  // This remaining queue row is a synthetic fixture, not a delivered CRM event.
  const remaining = (await (await post('/api/unsubscribe/claim', {}, sync)).json()).job;
  assert.ok(remaining);
  sql("UPDATE suppression_outbox SET lease_expires_at=1 WHERE event_id='" + remaining.eventId + "'");
  assert.equal((await (await post('/api/unsubscribe/claim', {}, sync)).json()).job, null);
  assert.equal(sql("SELECT status FROM suppression_outbox WHERE event_id='" + remaining.eventId + "'")[0].status, 'manual_review');

  stub = createServer(async (request, response) => {
    if (request.url === '/healthz') { response.writeHead(200); response.end('{}'); return; }
    if (request.url !== '/webhook/unsub-sync' || request.headers['x-varino-unsub-key'] !== n8nToken) { response.writeHead(401); response.end(); return; }
    let text = ''; for await (const chunk of request) text += chunk;
    const event = JSON.parse(text); assert.ok(event.email.endsWith('.test'));
    nativePosts++;
    response.writeHead(ambiguous ? 503 : 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(ambiguous ? { ok: false } : { ok: true, eventId: event.eventId, suppressed: true, duplicate: false }));
  });
  await new Promise((done) => stub.listen(0, '127.0.0.1', done));
  const stubConfig = suppressionWorkerConfiguration({ VARINO_CONTROL_URL: base, VARINO_SUPPRESSION_SYNC_TOKEN: sync,
    VARINO_N8N_UNSUB_TOKEN: n8nToken, VARINO_N8N_PORT: String(stub.address().port) });
  const realNative = process.env.VARINO_TEST_N8N_PORT;
  const config = realNative ? suppressionWorkerConfiguration({ VARINO_CONTROL_URL: base, VARINO_SUPPRESSION_SYNC_TOKEN: sync,
    VARINO_N8N_UNSUB_TOKEN: process.env.VARINO_TEST_N8N_TOKEN, VARINO_N8N_PORT: realNative }) : stubConfig;
  const endToEnd = await issue('endtoend@example.test');
  assert.equal((await confirm(endToEnd.token)).status, 200);
  await stop(); await start();
  assert.equal((await runSuppressionWorkerOnce(config)).status, 'synced');
  assert.equal((await blocked('endtoend@example.test')).status, 'blocked');
  assert.equal(sql("SELECT count(*) AS n FROM suppression_outbox WHERE status='synced' AND encrypted_email IS NOT NULL")[0].n, 0);
  console.log(realNative ? 'PASS: Pages → durable ledger → actual worker → isolated native n8n → synthetic Sheets → D1 acknowledgement. Real Google/Gmail are NOT tested.'
    : 'PASS: actual worker HTTP + synthetic native transport, persisted queue after restart; external integrations are NOT tested.');

  const ambiguousLink = await issue('ambiguous@example.test');
  await confirm(ambiguousLink.token); ambiguous = true;
  assert.equal((await runSuppressionWorkerOnce(stubConfig)).status, 'manual_review');
  const before = nativePosts;
  assert.equal((await runSuppressionWorkerOnce(stubConfig)).status, 'idle');
  assert.equal(nativePosts, before);
  assert.equal((await blocked('ambiguous@example.test')).status, 'blocked');
  sql('UPDATE suppression_outbox SET payload_expires_at=1 WHERE encrypted_email IS NOT NULL');
  const expiredLink = await issue('expired-link@example.test');
  sql("UPDATE unsubscribe_tokens SET expires_at=1 WHERE token_hash='" + hash(expiredLink.token) + "'");
  assert.equal((await runSuppressionWorkerOnce({ ...stubConfig, n8nBase: base })).status, 'local_unavailable');
  assert.equal(sql("SELECT count(*) AS n FROM unsubscribe_tokens WHERE token_hash='" + hash(expiredLink.token) + "'")[0].n, 0);
  assert.equal((await confirm(expiredLink.token)).status, 400);
  assert.equal(sql('SELECT count(*) AS n FROM suppression_outbox WHERE encrypted_email IS NOT NULL')[0].n, 0);
  assert.equal((await blocked('ambiguous@example.test')).status, 'blocked');
  console.log('PASS: one lease, idempotent acknowledgement, no ambiguous append replay; expired token/payload cleanup also runs with n8n offline, without clearing opposition.');

  const browserLink = await issue('browser@example.test');
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); const external = []; let publicPosts = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== base) external.push(request.url());
    if (request.url() === base + '/api/unsubscribe' && request.method() === 'POST') publicPosts++;
  });
  await page.goto(browserLink.url);
  await page.getByRole('button', { name: 'Confirmar mi baja', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Confirmar mi baja', exact: true }).isEnabled(), true);
  assert.equal(publicPosts, 0);
  assert.equal((await blocked('browser@example.test')).status, 'clear');
  assert.equal(new URL(page.url()).hash, '');
  await assertAccessible(page);
  let lost = false;
  await page.route('**/api/unsubscribe', async (route) => {
    if (!lost) { lost = true; const committed = await route.fetch(); assert.equal(committed.status(), 200); await route.abort('failed'); }
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Confirmar mi baja', exact: true }).click();
  await page.getByRole('button', { name: 'Volver a confirmar mi baja' }).waitFor();
  assert.equal((await blocked('browser@example.test')).status, 'blocked');
  await page.getByRole('button', { name: 'Volver a confirmar mi baja' }).click();
  await page.getByRole('button', { name: 'Baja confirmada' }).waitFor();
  assert.equal(publicPosts, 2);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'unsubscribe-status');
  assert.equal(await page.evaluate(() => [...Array(sessionStorage.length)].some((_, i) => (sessionStorage.getItem(sessionStorage.key(i)) || '').includes('token='))), false);
  assert.equal(await page.locator('#aichat-panel').count(), 0);
  assert.deepEqual(external, []);
  await assertAccessible(page);
  if (process.env.VARINO_TEST_UNSUBSCRIBE_SCREENSHOT) {
    await page.screenshot({ path: process.env.VARINO_TEST_UNSUBSCRIBE_SCREENSHOT });
    chmodSync(process.env.VARINO_TEST_UNSUBSCRIBE_SCREENSHOT, 0o600);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Cambiar a tema oscuro' }).click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await assertAccessible(page);
  if (process.env.VARINO_TEST_UNSUBSCRIBE_MOBILE_SCREENSHOT) {
    await page.screenshot({ path: process.env.VARINO_TEST_UNSUBSCRIBE_MOBILE_SCREENSHOT });
    chmodSync(process.env.VARINO_TEST_UNSUBSCRIBE_MOBILE_SCREENSHOT, 0o600);
  }
  await page.goto(base + '/baja/');
  assert.equal(await page.getByRole('button', { name: 'Confirmar mi baja', exact: true }).isDisabled(), true);
  assert.ok((await page.locator('#unsubscribe-status').innerText()).includes('no es válido'));
  console.log('PASS: actual Chromium opt-out, scanner-safe GET, lost response/retry without duplicate, no chat/analytics/third-party requests, focus feedback and zero Axe violations (desktop/mobile/dark/reduced motion).');

  // DB failures must not be interpreted as a clear suppression result.
  sql('ALTER TABLE mail_suppressions RENAME TO qa_unavailable_ledger');
  assert.equal((await blocked('browser@example.test')).status, 'unavailable');
  console.log('PASS: unavailable ledger closes the pre-send check, never returns clear.');
} finally {
  if (browser) await browser.close();
  await stop();
  if (stub) await new Promise((done) => stub.close(done));
  rmSync(persistence, { recursive: true, force: true });
}
