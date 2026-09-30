import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, chmodSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { ContactSubmission, CONTACT_NOTICE_VERSION } from '../src/lib/inbound-contract.mjs';
import { inboundWorkerConfiguration, runInboundWorkerOnce } from './local-inbound-worker.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
assert.ok(existsSync(resolve(root, 'dist/app/index.html')), 'Build the app first.');
const persistence = mkdtempSync(join(tmpdir(), 'varino-inbound-http-'));
const environment = { PATH: process.env.PATH, HOME: process.env.HOME, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' };
const localOnly = ['--local', '--persist-to', persistence];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const user = randomUUID(); const other = randomUUID(); const workspace = randomUUID(); const otherWorkspace = randomUUID();
const sessionToken = randomBytes(32).toString('base64url'); const otherToken = randomBytes(32).toString('base64url');
const workerToken = randomBytes(32).toString('base64url'); const n8nToken = randomBytes(32).toString('base64url');
const documentToken = randomBytes(32).toString('base64url');
const rateSecret = randomBytes(32).toString('base64url');
async function unusedPort() {
  const server = createServer(); await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const port = server.address().port; await new Promise((done) => server.close(done)); return port;
}
const sql = (command) => {
  const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'VARINO_DB', ...localOnly, '--command', command, '--json'], { cwd: root, env: environment, encoding: 'utf8', maxBuffer: 2e6 });
  assert.equal(result.status, 0, 'Local D1 setup failed (private output withheld).');
  return JSON.parse(result.stdout)[0]?.results ?? [];
};
const fixture = (changes = {}) => ({ submissionId: randomBytes(32).toString('hex'), nombre: 'Equipo ficticio QA',
  email: 'fixture@example.test', empresa: 'Empresa ficticia', whatsapp: '', interes: 'automation-sprint',
  fuente: 'form-contacto', pagina: '/contacto/', mensaje: 'Solicitud ficticia de un proceso para revisión humana.',
  privacy_acknowledged: true, marketing_consent: false, noticeVersion: CONTACT_NOTICE_VERSION,
  turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX', ...changes });
const port = await unusedPort(); const base = `http://127.0.0.1:${port}`;
let server; let fixtureServer; let crmPosts = 0; let ambiguous = false; let browser;
async function start(enabled = true) {
  server = spawn(process.execPath, [wrangler, 'pages', 'dev', 'dist', '--local', '--port', String(port), '--persist-to', persistence,
    '--binding', `APP_BASE_URL=${base}`, '--binding', `AGENCY_WORKSPACE_ID=${workspace}`,
    '--binding', `LEAD_WORKER_TOKEN_HASH=${hash(workerToken)}`, '--binding', `INBOUND_RATE_SECRET=${rateSecret}`,
    '--binding', `DOCUMENT_WORKER_TOKEN_HASH=${hash(documentToken)}`,
    '--binding', 'INBOUND_MODE=local-test', '--binding', `INBOUND_CAPTURE_ENABLED=${enabled ? '1' : '0'}`,
    '--show-interactive-dev-session', 'false', '--log-level', 'error'], { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.resume(); server.stderr.resume();
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (server.exitCode !== null) throw new Error('Local Pages stopped.');
    try { if ((await fetch(`${base}/api/auth/session`, { signal: AbortSignal.timeout(1000) })).status === 401) return; } catch { /* startup */ }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error('Local Pages timed out.');
}
async function stop() {
  if (server && server.exitCode === null) { const exited = new Promise((done) => server.once('exit', done)); server.kill('SIGTERM'); await exited; }
}
const headers = { origin: base, 'content-type': 'application/json' };
const workerHeaders = { authorization: `Bearer ${workerToken}`, 'content-type': 'application/json' };
const submit = (body, suppliedHeaders = headers) => fetch(`${base}/api/briefings`, { method: 'POST', headers: suppliedHeaders, body: JSON.stringify(body) });
const claim = (suppliedHeaders = workerHeaders) => fetch(`${base}/api/inbound/claim`, { method: 'POST', headers: suppliedHeaders, body: '{}' });
const report = (body) => fetch(`${base}/api/inbound/result`, { method: 'POST', headers: workerHeaders, body: JSON.stringify(body) });
const clearLimit = () => sql('DELETE FROM inbound_rate_limits');
try {
  const migrated = spawnSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'VARINO_DB', ...localOnly], { cwd: root, env: environment, encoding: 'utf8' });
  assert.equal(migrated.status, 0, 'Local migration failed.');
  const now = Math.floor(Date.now() / 1000);
  sql(`INSERT INTO users(id,email,status,created_at,updated_at) VALUES('${user}','owner@example.test','active',${now},${now}),('${other}','other@example.test','active',${now},${now});
    INSERT INTO sessions(id,user_id,token_hash,issued_at,expires_at) VALUES('${randomUUID()}','${user}','${hash(sessionToken)}',${now},${now + 3600}),('${randomUUID()}','${other}','${hash(otherToken)}',${now},${now + 3600});
    INSERT INTO workspaces(id,name,slug,status,created_at,updated_at) VALUES('${workspace}','Agency fixture','agency-fixture','active',${now},${now}),('${otherWorkspace}','Other fixture','other-fixture','active',${now},${now});
    INSERT INTO workspace_members(workspace_id,user_id,role,status,created_at,updated_at) VALUES('${workspace}','${user}','OWNER','active',${now},${now}),('${otherWorkspace}','${other}','OWNER','active',${now},${now});`);
  await start(false);
  assert.deepEqual(await (await fetch(`${base}/api/briefings/config`)).json(), { enabled: false });
  assert.equal((await submit(fixture())).status, 503);
  assert.equal(sql('SELECT count(*) AS n FROM inbound_requests')[0].n, 0);
  await stop(); await start();
  const publicConfig = await (await fetch(`${base}/api/briefings/config`)).json();
  assert.deepEqual(publicConfig, { enabled: true, mode: 'local-test', noticeVersion: CONTACT_NOTICE_VERSION });
  assert.equal((await fetch(`${base}/api/briefings/config`, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await fetch(`${base}/api/briefings/config`, { method: 'POST' })).status, 405);
  sql(`UPDATE workspaces SET status='suspended' WHERE id='${workspace}'`);
  assert.deepEqual(await (await fetch(`${base}/api/briefings/config`)).json(), { enabled: false });
  sql(`UPDATE workspaces SET status='active' WHERE id='${workspace}'`);
  assert.equal((await submit(fixture(), { 'content-type': 'application/json' })).status, 403);
  assert.equal((await submit(fixture(), { ...headers, origin: 'https://attacker.test' })).status, 403);
  assert.equal((await submit(fixture({ marketing_consent: 'true' }))).status, 400);
  assert.equal((await submit(fixture({ privacy_acknowledged: false }))).status, 400);
  assert.equal((await submit(fixture({ noticeVersion: 'old' }))).status, 400);
  assert.equal((await submit(fixture({ secret: 'not-allowed' }))).status, 400);
  assert.equal((await submit(fixture({ mensaje: 'x'.repeat(9000) }))).status, 413);
  assert.equal((await submit(fixture({ email: 'real@example.com' }))).status, 400);
  assert.equal((await submit(fixture({ turnstileToken: 'bad-token' }))).status, 422);
  clearLimit();

  const body = fixture();
  const responses = await Promise.all(Array.from({ length: 6 }, () => submit(body)));
  assert.ok(responses.every((response) => response.status === 202));
  const receipts = await Promise.all(responses.map((response) => response.json()));
  assert.equal(new Set(receipts.map((receipt) => receipt.receiptId)).size, 1);
  assert.equal(receipts.filter((receipt) => !receipt.duplicate).length, 1);
  assert.ok(receipts.every((receipt) => receipt.crmConfirmed === false && !JSON.stringify(receipt).includes(body.email)));
  assert.equal((await submit({ ...body, empresa: 'Otra empresa ficticia' })).status, 409);
  const stored = sql('SELECT payload_json,notice_version,marketing_consent,marketing_source FROM inbound_requests')[0];
  assert.equal(stored.marketing_consent, 0); assert.equal(stored.marketing_source, '');
  assert.equal(stored.notice_version, CONTACT_NOTICE_VERSION); assert.ok(!stored.payload_json.includes('DUMMY.TOKEN'));
  assert.equal(sql("SELECT count(*) AS n FROM audit_events WHERE action = 'inbound.received'")[0].n, 1);
  assert.equal((await claim({ ...workerHeaders, authorization: 'Bearer ' + 'z'.repeat(43) })).status, 401);
  assert.equal((await claim({ ...workerHeaders, authorization: `Bearer ${documentToken}` })).status, 401);
  assert.equal((await claim({ ...workerHeaders, origin: base })).status, 401);
  const claims = await Promise.all([claim(), claim()]);
  assert.ok(claims.every((response) => response.status === 200));
  const claimed = await Promise.all(claims.map((response) => response.json()));
  const jobs = claimed.map((result) => result.job).filter(Boolean);
  assert.equal(jobs.length, 1); const job = jobs[0];
  assert.equal((await report({ jobId: job.id, leaseToken: job.leaseToken, result: { leadId: 'L_' + 'b'.repeat(64), verified: true } })).status, 400);
  const completion = { jobId: job.id, leaseToken: job.leaseToken, result: { leadId: 'L_' + body.submissionId, verified: true } };
  const completed = await Promise.all([report(completion), report(completion)]);
  assert.ok(completed.every((response) => response.status === 200));
  assert.equal(sql('SELECT payload_json FROM inbound_requests')[0].payload_json, null);
  assert.equal(sql("SELECT count(*) AS n FROM audit_events WHERE action = 'inbound.result'")[0].n, 1);
  assert.equal((await report({ ...completion, errorCode: 'crm_unconfirmed' })).status, 400);
  assert.equal((await report({ jobId: job.id, leaseToken: job.leaseToken, errorCode: 'crm_unconfirmed' })).status, 409);
  console.log('PASS: real Pages/D1 HTTP, strict input, same-origin, durable receipt, concurrent deduplication, one CRM lease and idempotent result.');
  clearLimit();

  fixtureServer = createServer(async (request, response) => {
    if (request.url === '/healthz') { response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"status":"ok"}'); return; }
    if (request.url !== '/webhook/lead' || request.headers['x-varino-lead-key'] !== n8nToken) { response.writeHead(401); response.end(); return; }
    let text = ''; for await (const chunk of request) text += chunk;
    const lead = JSON.parse(text); ContactSubmission.omit({ turnstileToken: true, website: true }).parse(lead);
    assert.equal(lead.marketing_consent, false, 'Unverified contact must not enter commercial nurturing.');
    crmPosts += 1;
    response.writeHead(ambiguous ? 503 : 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(ambiguous ? { ok: false } : { ok: true, leadId: 'L_' + lead.submissionId }));
  });
  await new Promise((done) => fixtureServer.listen(0, '127.0.0.1', done));
  const realN8n = process.env.VARINO_TEST_N8N_PORT;
  const config = inboundWorkerConfiguration({ VARINO_CONTROL_URL: base, VARINO_LEAD_WORKER_TOKEN: workerToken,
    VARINO_N8N_LEAD_TOKEN: realN8n ? process.env.VARINO_TEST_N8N_TOKEN : n8nToken,
    VARINO_N8N_PORT: realN8n || String(fixtureServer.address().port) });
  const optedIn = fixture({ marketing_consent: true });
  const optedReceipt = await (await submit(optedIn)).json();
  assert.ok(optedReceipt.receiptId);
  await stop(); await start();
  assert.equal((await runInboundWorkerOnce(config)).status, 'crm_confirmed');
  const opted = sql(`SELECT status,payload_json,marketing_source FROM inbound_requests WHERE id='${optedReceipt.receiptId}'`)[0];
  assert.equal(opted.status, 'crm_confirmed'); assert.equal(opted.payload_json, null); assert.equal(opted.marketing_source, 'contacto-marketing-checkbox-v1');
  console.log(realN8n ? 'PASS: real worker → isolated n8n → synthetic Sheets fixture → confirmed receipt. Google OAuth/Telegram are NOT tested.' : 'PASS: real worker HTTP → n8n transport stub; pending request survived Pages restart. External integrations are NOT tested.');
  ambiguous = true;
  const stubConfig = inboundWorkerConfiguration({ VARINO_CONTROL_URL: base, VARINO_LEAD_WORKER_TOKEN: workerToken,
    VARINO_N8N_LEAD_TOKEN: n8nToken, VARINO_N8N_PORT: String(fixtureServer.address().port) });
  await submit(fixture());
  assert.equal((await runInboundWorkerOnce(stubConfig)).status, 'manual_review');
  const postsBefore = crmPosts;
  assert.equal((await runInboundWorkerOnce(stubConfig)).status, 'idle'); assert.equal(crmPosts, postsBefore);
  const stale = await (await submit(fixture())).json();
  const staleJob = (await (await claim()).json()).job; assert.equal(staleJob.id, stale.receiptId);
  sql(`UPDATE inbound_requests SET lease_expires_at=1 WHERE id='${staleJob.id}'`);
  assert.equal((await (await claim()).json()).job, null);
  assert.equal(sql(`SELECT status FROM inbound_requests WHERE id='${staleJob.id}'`)[0].status, 'manual_review');
  assert.equal((await report({ jobId: staleJob.id, leaseToken: staleJob.leaseToken, result: { leadId: 'L_' + staleJob.lead.submissionId, verified: true } })).status, 409);
  const expired = await (await submit(fixture())).json();
  sql(`UPDATE inbound_requests SET payload_expires_at=1 WHERE id='${expired.receiptId}'`);
  await claim();
  assert.deepEqual(sql(`SELECT status,payload_json FROM inbound_requests WHERE id='${expired.receiptId}'`)[0], { status: 'expired', payload_json: null });
  console.log('PASS: ambiguous write and expired lease stop automatic replay; payload retention removes only this synthetic buffer copy.');
  const ownerHeaders = { cookie: `varino_session=${sessionToken}` };
  assert.equal((await fetch(`${base}/api/inbound`)).status, 401);
  assert.equal((await fetch(`${base}/api/inbound`, { headers: { cookie: `varino_session=${otherToken}` } })).status, 403);
  const listResponse = await fetch(`${base}/api/inbound`, { headers: ownerHeaders }); assert.equal(listResponse.status, 200);
  const listText = await listResponse.text(); assert.ok(!listText.includes('fixture@example.test') && !listText.includes('Equipo ficticio') && !listText.includes('leaseToken'));
  assert.ok(listText.includes('L_' + body.submissionId));
  const audit = JSON.stringify(sql('SELECT metadata_json FROM audit_events')); assert.ok(!audit.includes('fixture@example.test') && !audit.includes('Equipo ficticio'));
  clearLimit();
  for (let i = 0; i < 10; i += 1) assert.equal((await submit({})).status, 400);
  const limited = await submit({}); assert.equal(limited.status, 429); assert.ok(limited.headers.get('retry-after'));
  assert.ok(!JSON.stringify(sql('SELECT * FROM inbound_rate_limits')).includes('127.0.0.1'));
  sql('UPDATE inbound_rate_limits SET expires_at=1');
  assert.equal((await submit({})).status, 400);

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await context.addCookies([{ name: 'varino_session', value: sessionToken, url: base }]);
  const page = await context.newPage(); await page.goto(`${base}/app/`);
  await page.locator('#inbound-panel').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#inbound-list > li').count(), 5);
  assert.ok((await page.locator('#inbound-list').innerText()).includes('Revisión necesaria'));
  assert.ok(!(await page.locator('#inbound-list').innerText()).includes('fixture@example.test'));
  await page.getByRole('button', { name: 'Actualizar solicitudes' }).click();
  await page.locator('#refresh-inbound:not(:disabled)').waitFor();
  if (process.env.VARINO_TEST_SCREENSHOT) {
    await page.locator('#inbound-panel').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -100));
    await page.screenshot({ path: process.env.VARINO_TEST_SCREENSHOT }); chmodSync(process.env.VARINO_TEST_SCREENSHOT, 0o600);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  assert.ok(await page.locator('#inbound-panel').isVisible());
  if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) {
    console.log('Layout diagnostic (no content):', await page.evaluate(() => [...document.querySelectorAll('main *')].filter((element) => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 10).map((element) => ({ tag: element.tagName, id: element.id, class: element.className, width: Math.round(element.getBoundingClientRect().width) }))));
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await context.close();
  console.log('PASS: real Chromium owner dashboard; no PII in list/audit/errors; different workspace denied; keyed temporary abuse limit.');
  clearLimit();
  const contactContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const contactPage = await contactContext.newPage(); const submissions = []; let savedReceipt;
  const schemaFiles = readdirSync(resolve(root, 'dist/_astro')).filter((name) => /^inbound-contract\..*\.js$/.test(name));
  assert.ok(schemaFiles.length > 0, 'Contact validation must remain a separate lazy asset.');
  const schemaRequests = [];
  const external = [];
  contactPage.on('request', (request) => {
    if (!request.url().startsWith(base + '/')) external.push(request.url());
    if (schemaFiles.some((name) => new URL(request.url()).pathname === '/_astro/' + name)) schemaRequests.push(request.url());
  });
  await contactPage.route(`${base}/api/briefings`, async (route) => {
    submissions.push(route.request().postDataJSON());
    // Real request/real commit. Simulate only loss of the response AFTER storage.
    const response = await route.fetch();
    if (submissions.length === 1) {
      assert.equal(response.status(), 202); savedReceipt = await response.json();
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"service_unavailable"}' });
    } else await route.fulfill({ response });
  });
  await contactPage.goto(`${base}/contacto/`);
  const form = contactPage.locator('#form-contacto');
  await form.getByRole('button', { name: 'Enviar solicitud →' }).waitFor();
  assert.equal(schemaRequests.length, 0, 'Do not load the schema library on a contact page visit.');
  assert.ok((await form.locator('[data-contact-live]').innerText()).includes('Ensayo local'));
  await form.getByLabel('Nombre completo').fill('Equipo ficticio UI');
  await form.getByLabel('Empresa / organización').fill('Empresa ficticia');
  await form.getByLabel('Email', { exact: true }).fill('form@example.test');
  await form.getByLabel('Sitio web o software').fill('Herramienta ficticia');
  await form.getByLabel('Detalles del proyecto').fill('Caso ficticio: organizar solicitudes para revisión humana.');
  await form.getByLabel('Servicio de interés').selectOption({ label: 'Automatización de procesos' });
  await form.getByRole('button', { name: 'Enviar solicitud →' }).click();
  assert.equal(submissions.length, 0, 'Unchecked privacy must prevent submission.');
  assert.equal(schemaRequests.length, 0, 'Do not load validation before a valid explicit submit.');
  await form.locator('[name="privacy_acknowledged"]').check();
  await form.locator('[name="marketing_consent"]').check();
  const beforeForm = sql('SELECT count(*) AS n FROM inbound_requests')[0].n;
  await form.getByRole('button', { name: 'Enviar solicitud →' }).click();
  await form.getByRole('button', { name: 'Confirmar el mismo envío' }).waitFor();
  assert.ok(schemaRequests.length > 0, 'Validation must load before sending a live request.');
  const privateStorage = await contactPage.evaluate(() => [...Array(sessionStorage.length)].map((_, i) => {
    const key = sessionStorage.key(i); return [key, sessionStorage.getItem(key)];
  }).filter(([key]) => key.startsWith('varino:lead:')));
  assert.equal(privateStorage.length, 1);
  assert.deepEqual(privateStorage[0], ['varino:lead:contacto-buffer-v1:v1', privateStorage[0][1]]);
  assert.match(privateStorage[0][1], /^[a-f0-9]{32}$/i, 'Session storage must contain only an opaque nonce, not form data.');
  assert.equal(await form.getByLabel('Nombre completo').isDisabled(), true);
  assert.equal(await form.getByLabel('Email', { exact: true }).inputValue(), 'form@example.test');
  assert.ok((await form.locator('[data-form-status]').innerText()).includes('No se pudo confirmar'));
  assert.equal(await form.locator('#contacto-mailto').isVisible(), false);
  await form.getByRole('button', { name: 'Confirmar el mismo envío' }).click();
  await form.locator('[data-contact-receipt]').waitFor({ state: 'visible' });
  assert.equal(submissions.length, 2); assert.equal(submissions[0].submissionId, submissions[1].submissionId);
  assert.ok(submissions[0].mensaje.includes('Herramienta ficticia'));
  assert.equal(await form.locator('[data-contact-reference]').innerText(), savedReceipt.receiptId);
  assert.equal(sql('SELECT count(*) AS n FROM inbound_requests')[0].n, beforeForm + 1);
  assert.ok((await form.locator('[data-form-status]').innerText()).includes('sin crear otro'));
  assert.equal(await form.locator('button[type="submit"]').isDisabled(), true);
  assert.equal(await contactPage.evaluate(() => document.activeElement?.hasAttribute('data-contact-receipt')), true);
  ambiguous = false;
  assert.equal((await runInboundWorkerOnce(realN8n ? config : stubConfig)).status, 'crm_confirmed');
  assert.equal(sql(`SELECT payload_json FROM inbound_requests WHERE id='${savedReceipt.receiptId}'`)[0].payload_json, null);
  await contactPage.setViewportSize({ width: 375, height: 812 });
  await contactPage.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  if (!await contactPage.locator('html').evaluate((element) => element.classList.contains('dark'))) {
    await contactPage.getByRole('button', { name: 'Cambiar a tema oscuro' }).click();
  }
  assert.ok(await contactPage.locator('html').evaluate((element) => element.classList.contains('dark')));
  assert.ok(await contactPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (process.env.VARINO_TEST_CONTACT_SCREENSHOT) {
    await form.locator('[data-contact-receipt]').scrollIntoViewIfNeeded();
    await contactPage.screenshot({ path: process.env.VARINO_TEST_CONTACT_SCREENSHOT });
    chmodSync(process.env.VARINO_TEST_CONTACT_SCREENSHOT, 0o600);
  }
  await form.getByRole('button', { name: 'Preparar otra solicitud' }).click();
  assert.equal(await form.getByLabel('Email', { exact: true }).inputValue(), '');
  assert.equal(await form.locator('[name="privacy_acknowledged"]').isChecked(), false);
  assert.equal(await form.locator('[name="marketing_consent"]').isChecked(), false);
  assert.equal(await form.getByLabel('Nombre completo').isDisabled(), false);
  assert.deepEqual(external, [], 'Synthetic form must not call third parties or private webhooks.');
  await contactContext.close();
  console.log(realN8n ? 'PASS: real Chromium contact form → persistent receipt (lost first response) → same receipt without duplicate → real isolated n8n; Sheets/Telegram transports remain synthetic.' : 'PASS: real Chromium contact form → real D1 receipt; lost response recovered without duplicate; actual worker uses synthetic n8n transport.');
  console.log('PASS: form retains fields, requires privacy, does not open mail on ambiguity, resets only explicitly, no external requests, mobile reduced-motion layout.');
  clearLimit();
  const existing = sql('SELECT count(*) AS n FROM inbound_requests')[0].n;
  const quotaRows = Array.from({ length: 100 - existing }, () => {
    const id = randomUUID(); const submission = randomBytes(32).toString('hex');
    return `INSERT INTO inbound_requests(id,workspace_id,submission_id,request_hash,payload_json,service,notice_version,marketing_consent,marketing_source,received_at,payload_expires_at,status,updated_at)
      VALUES('${id}','${workspace}','${submission}','${hash(submission)}',NULL,'otro','${CONTACT_NOTICE_VERSION}',0,'',${now},${now + 86400},'crm_confirmed',${now});`;
  }).join('\n');
  sql(quotaRows);
  const auditBefore = sql('SELECT count(*) AS n FROM audit_events')[0].n;
  assert.equal((await submit(fixture())).status, 503);
  assert.equal(sql('SELECT count(*) AS n FROM inbound_requests')[0].n, 100);
  assert.equal(sql('SELECT count(*) AS n FROM audit_events')[0].n, auditBefore);
  console.log('PASS: rolling 100-receipt cap fails closed without an extra row or phantom audit event.');
} finally {
  if (browser) await browser.close();
  await stop();
  if (fixtureServer) await new Promise((done) => fixtureServer.close(done));
  rmSync(persistence, { recursive: true, force: true });
}
