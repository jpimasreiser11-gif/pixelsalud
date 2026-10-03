import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { DocumentResult } from '../src/lib/autopilot/document-contract.mjs';
import { containsPrivateData } from '../src/lib/guide-engine.mjs';

const Job = z.strictObject({
  id: z.string().uuid(), kind: z.literal('document_pack_draft'),
  brief: z.string().min(20).max(4000).refine((text) => !containsPrivateData(text)),
  attempt: z.number().int().min(1).max(3),
  leaseToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/), leaseExpiresAt: z.number().int(),
});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function workerConfiguration(env = process.env) {
  const base = new URL(env.VARINO_CONTROL_URL || '');
  const local = base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((!local && base.protocol !== 'https:') || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('invalid_control_url');
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(env.VARINO_DOCUMENT_WORKER_TOKEN ?? '')) throw new Error('missing_worker_token');
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(env.VARINO_N8N_DOCUMENT_TOKEN ?? '')) throw new Error('missing_n8n_token');
  const port = env.VARINO_N8N_PORT ?? '5679';
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('invalid_local_port');
  return { base: base.origin, token: env.VARINO_DOCUMENT_WORKER_TOKEN,
    n8nUrl: `http://127.0.0.1:${port}/webhook/document-pack-draft`, n8nToken: env.VARINO_N8N_DOCUMENT_TOKEN };
}
async function boundedResponse(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('invalid_response');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error('invalid_response'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export async function runDocumentWorkerOnce(config, { fetcher = fetch, sleep = delay } = {}) {
  const control = (path, body) => fetcher(`${config.base}${path}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const response = await control('/api/jobs/claim', {});
  if (!response.ok) throw new Error([401, 403].includes(response.status) ? 'worker_auth_rejected' : 'control_unavailable');
  const claim = z.strictObject({ job: Job.nullable() }).parse(await boundedResponse(response, 8192));
  if (!claim.job) return { status: 'idle' };
  const job = claim.job;
  if (job.leaseExpiresAt * 1000 < Date.now() + 300000) throw new Error('lease_too_short');
  let report;
  try {
    const generated = await fetcher(config.n8nUrl, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(270000),
      headers: { 'content-type': 'application/json', 'x-varino-document-key': config.n8nToken },
      body: JSON.stringify({ brief: job.brief }),
    });
    if (!generated.ok) report = { errorCode: generated.status === 502 ? 'invalid_output' : 'local_unavailable' };
    else {
      const parsed = DocumentResult.safeParse(await boundedResponse(generated, 80000));
      report = parsed.success ? { result: parsed.data } : { errorCode: 'invalid_output' };
    }
  } catch { report = { errorCode: 'local_unavailable' }; }
  // Retry only the same completion payload. Never infer success from an HTTP timeout.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const completed = await control('/api/jobs/result', { jobId: job.id, leaseToken: job.leaseToken, ...report });
      if (completed.status === 409) return { status: 'lease_lost', jobId: job.id };
      if ([401, 403].includes(completed.status)) throw new Error('worker_auth_rejected');
      if (completed.ok) {
        const result = z.object({ accepted: z.literal(true), status: z.enum(['completed', 'pending', 'manual_review']) }).parse(await boundedResponse(completed, 2048));
        return { status: result.status, jobId: job.id };
      }
    } catch (error) { if (error.message === 'worker_auth_rejected') throw error; }
    await sleep(1000 * 2 ** attempt);
  }
  throw new Error('result_unconfirmed');
}

async function main() {
  const config = workerConfiguration();
  if (process.argv.includes('--once')) {
    console.log(JSON.stringify(await runDocumentWorkerOnce(config)));
    return;
  }
  let stopping = false;
  process.once('SIGTERM', () => { stopping = true; });
  process.once('SIGINT', () => { stopping = true; });
  while (!stopping) {
    try {
      const result = await runDocumentWorkerOnce(config);
      if (result.status !== 'idle') console.log(JSON.stringify(result));
    } catch (error) {
      // Never log response bodies, briefs, documents, headers, URLs or secrets.
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
