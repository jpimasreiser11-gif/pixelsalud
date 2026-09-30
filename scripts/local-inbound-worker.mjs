import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { InboundJob } from '../src/lib/inbound-contract.mjs';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function inboundWorkerConfiguration(env = process.env) {
  const base = new URL(env.VARINO_CONTROL_URL || '');
  const local = base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
  if ((!local && base.protocol !== 'https:') || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('invalid_control_url');
  for (const key of ['VARINO_LEAD_WORKER_TOKEN', 'VARINO_N8N_LEAD_TOKEN']) {
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(env[key] ?? '')) throw new Error('missing_worker_credentials');
  }
  if (env.VARINO_LEAD_WORKER_TOKEN === env.VARINO_N8N_LEAD_TOKEN) throw new Error('separate_credentials_required');
  const port = env.VARINO_N8N_PORT ?? '5679';
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('invalid_local_port');
  return { base: base.origin, token: env.VARINO_LEAD_WORKER_TOKEN,
    n8nBase: `http://127.0.0.1:${port}`, n8nToken: env.VARINO_N8N_LEAD_TOKEN };
}
async function boundedJson(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('invalid_response');
  const chunks = []; let size = 0;
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
export async function runInboundWorkerOnce(config, { fetcher = fetch, sleep = delay } = {}) {
  // If the local service is down, don't lease a request that cannot be delivered.
  try {
    const health = await fetcher(`${config.n8nBase}/healthz`, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!health.ok) return { status: 'local_unavailable' };
  } catch { return { status: 'local_unavailable' }; }
  const control = (path, body) => fetcher(`${config.base}${path}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const response = await control('/api/inbound/claim', {});
  if (!response.ok) throw new Error([401, 403].includes(response.status) ? 'worker_auth_rejected' : 'control_unavailable');
  const { job } = z.strictObject({ job: InboundJob.nullable() }).parse(await boundedJson(response, 12000));
  if (!job) return { status: 'idle' };
  if (job.leaseExpiresAt * 1000 < Date.now() + 300000) throw new Error('lease_too_short');
  let report;
  try {
    // Exactly one POST per lease. An ambiguous write is NOT automatically replayed.
    const delivered = await fetcher(`${config.n8nBase}/webhook/lead`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000),
      headers: { 'content-type': 'application/json', 'x-varino-lead-key': config.n8nToken },
      // A checkbox is a requested opt-in, not proof of ownership of that inbox.
      // Until a verified email-confirmation flow exists, never enroll this lead
      // in the existing n8n commercial nurture channel. Keep the choice in D1.
      body: JSON.stringify({ ...job.lead, marketing_consent: false }),
    });
    if (!delivered.ok) report = { errorCode: 'crm_unconfirmed' };
    else {
      const data = await boundedJson(delivered, 8192);
      report = data?.ok === true && data.leadId === `L_${job.lead.submissionId}`
        ? { result: { leadId: data.leadId, verified: true } }
        : { errorCode: 'invalid_response' };
    }
  } catch { report = { errorCode: 'crm_unconfirmed' }; }
  const body = { jobId: job.id, leaseToken: job.leaseToken, ...report };
  // Only retry the identical acknowledgement, never the Sheets/n8n write.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const confirmed = await control('/api/inbound/result', body);
      if (confirmed.status === 409) return { status: 'lease_lost', jobId: job.id };
      if ([401, 403].includes(confirmed.status)) throw new Error('worker_auth_rejected');
      if (confirmed.ok) {
        const data = z.object({ accepted: z.literal(true), status: z.enum(['crm_confirmed', 'manual_review']) }).parse(await boundedJson(confirmed, 2048));
        return { status: data.status, jobId: job.id };
      }
    } catch (error) { if (error.message === 'worker_auth_rejected') throw error; }
    await sleep(1000 * 2 ** attempt);
  }
  throw new Error('result_unconfirmed');
}
async function main() {
  const config = inboundWorkerConfiguration();
  if (process.argv.includes('--once')) { console.log(JSON.stringify(await runInboundWorkerOnce(config))); return; }
  let stopping = false;
  process.once('SIGTERM', () => { stopping = true; });
  process.once('SIGINT', () => { stopping = true; });
  while (!stopping) {
    try {
      const result = await runInboundWorkerOnce(config);
      if (!['idle', 'local_unavailable'].includes(result.status)) console.log(JSON.stringify(result));
    } catch (error) {
      const code = ['worker_auth_rejected', 'control_unavailable', 'lease_too_short', 'result_unconfirmed'].includes(error.message) ? error.message : 'worker_failed';
      console.error(JSON.stringify({ error: code }));
      if (code === 'worker_auth_rejected') { process.exitCode = 1; return; }
    }
    if (!stopping) await delay(15000);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('{"error":"worker_configuration_invalid"}'); process.exitCode = 1; });
}
