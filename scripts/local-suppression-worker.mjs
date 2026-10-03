import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { Recipient, SuppressionJob } from '../src/lib/unsubscribe-contract.mjs';

const delay = (ms) => new Promise((done) => setTimeout(done, ms));
export function suppressionWorkerConfiguration(env = process.env) {
  const base = new URL(env.VARINO_CONTROL_URL || '');
  const local = base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((!local && base.protocol !== 'https:') || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('invalid_control_url');
  const token = env.VARINO_SUPPRESSION_SYNC_TOKEN;
  const n8nToken = env.VARINO_N8N_UNSUB_TOKEN;
  if (![token, n8nToken].every((value) => /^[A-Za-z0-9_-]{43,128}$/.test(value ?? ''))) throw new Error('missing_worker_credentials');
  if (token === n8nToken) throw new Error('separate_credentials_required');
  const port = env.VARINO_N8N_PORT ?? '5679';
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('invalid_local_port');
  return { base: base.origin, token, n8nToken, n8nBase: 'http://127.0.0.1:' + port };
}
async function boundedJson(response, limit = 2048) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('invalid_response');
  let size = 0; const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error('invalid_response'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export async function checkDurableSuppression(config, email, { fetcher = fetch } = {}) {
  // This only checks opposition. 'clear' is NOT consent or authorization to send.
  try {
    const recipient = Recipient.parse(email);
    const base = new URL(config.base);
    const local = base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if ((!local && base.protocol !== 'https:') || base.username || base.password || base.pathname !== '/' || base.search || base.hash
      || !/^[A-Za-z0-9_-]{43,128}$/.test(config.checkToken ?? '')) return { status: 'unavailable' };
    const response = await fetcher(base.origin + '/api/unsubscribe/check', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { authorization: 'Bearer ' + config.checkToken, 'content-type': 'application/json' },
      body: JSON.stringify({ email: recipient }),
    });
    if (!response.ok) return { status: 'unavailable' };
    const result = z.strictObject({ suppressed: z.boolean() }).parse(await boundedJson(response));
    return { status: result.suppressed ? 'blocked' : 'clear' };
  } catch { return { status: 'unavailable' }; }
}
export async function runSuppressionWorkerOnce(config, { fetcher = fetch, sleep = delay } = {}) {
  const control = (path, body) => fetcher(config.base + path, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: 'Bearer ' + config.token, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  // Retention does not depend on CRM/n8n health. This remains a scoped private call.
  const maintained = await control('/api/unsubscribe/maintenance', {});
  if (!maintained.ok) throw new Error([401, 403].includes(maintained.status) ? 'worker_auth_rejected' : 'control_unavailable');
  z.strictObject({ ok: z.literal(true) }).parse(await boundedJson(maintained));
  try {
    const health = await fetcher(config.n8nBase + '/healthz', { redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!health.ok) return { status: 'local_unavailable' };
  } catch { return { status: 'local_unavailable' }; }
  const response = await control('/api/unsubscribe/claim', {});
  if (!response.ok) throw new Error([401, 403].includes(response.status) ? 'worker_auth_rejected' : 'control_unavailable');
  const { job } = z.strictObject({ job: SuppressionJob.nullable() }).parse(await boundedJson(response));
  if (!job) return { status: 'idle' };
  if (job.leaseExpiresAt * 1000 < Date.now() + 300000) throw new Error('lease_too_short');
  let report;
  try {
    // Exactly one native call per lease. Never replay an ambiguous write automatically.
    const synced = await fetcher(config.n8nBase + '/webhook/unsub-sync', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000),
      headers: { 'x-varino-unsub-key': config.n8nToken, 'content-type': 'application/json' },
      body: JSON.stringify({ email: job.email, eventId: job.eventId, requestedAt: job.requestedAt }),
    });
    if (!synced.ok) report = { errorCode: 'crm_unconfirmed' };
    else {
      const data = z.strictObject({ ok: z.literal(true), eventId: z.string(),
        suppressed: z.literal(true), duplicate: z.boolean() }).parse(await boundedJson(synced));
      report = data.eventId === job.eventId ? { result: { ok: true, status: 'suppressed', eventId: job.eventId } }
        : { errorCode: 'invalid_response' };
    }
  } catch { report = { errorCode: 'crm_unconfirmed' }; }
  const body = { eventId: job.eventId, leaseToken: job.leaseToken, ...report };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const acknowledged = await control('/api/unsubscribe/result', body);
      if (acknowledged.status === 409) return { status: 'lease_lost', eventId: job.eventId };
      if ([401, 403].includes(acknowledged.status)) throw new Error('worker_auth_rejected');
      if (acknowledged.ok) {
        const data = z.object({ accepted: z.literal(true), status: z.enum(['synced', 'manual_review']) }).parse(await boundedJson(acknowledged));
        return { status: data.status, eventId: job.eventId };
      }
    } catch (error) { if (error.message === 'worker_auth_rejected') throw error; }
    await sleep(1000 * 2 ** attempt);
  }
  throw new Error('result_unconfirmed');
}
async function main() {
  const config = suppressionWorkerConfiguration();
  if (process.argv.includes('--once')) { console.log(JSON.stringify(await runSuppressionWorkerOnce(config))); return; }
  let stopping = false;
  process.once('SIGINT', () => { stopping = true; });
  process.once('SIGTERM', () => { stopping = true; });
  while (!stopping) {
    try {
      const result = await runSuppressionWorkerOnce(config);
      if (!['idle', 'local_unavailable'].includes(result.status)) console.log(JSON.stringify(result));
    } catch (error) {
      const code = ['worker_auth_rejected', 'control_unavailable', 'lease_too_short', 'result_unconfirmed'].includes(error.message)
        ? error.message : 'worker_failed';
      console.error(JSON.stringify({ error: code }));
      if (code === 'worker_auth_rejected') { process.exitCode = 1; return; }
    }
    if (!stopping) await delay(15000);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('{"error":"worker_configuration_invalid"}'); process.exitCode = 1; });
}
