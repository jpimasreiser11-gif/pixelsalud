import { describe, it, expect } from 'vitest';
import { DocumentResult, DOCUMENT_KEYS, briefFromPlan } from '../../src/lib/autopilot/document-contract.mjs';
import { workerConfiguration, runDocumentWorkerOnce } from '../../scripts/local-document-worker.mjs';

const token = 'a'.repeat(43);
const config = workerConfiguration({ VARINO_CONTROL_URL: 'http://127.0.0.1:43219', VARINO_DOCUMENT_WORKER_TOKEN: token, VARINO_N8N_DOCUMENT_TOKEN: token });
const plan = { name: 'Proceso ficticio', objective: 'Resumir solicitudes sintéticas del equipo', steps: [{ kind: 'summarize', instruction: 'Preparar un resumen para revisión' }], requiredIntegrations: [] };
const result = {
  ok: true, status: 'draft_human_review_required', model: 'qwen3.6:27b',
  documents: Object.fromEntries(DOCUMENT_KEYS.map((key) => [key, `# ${key}\n${'Propuesta por confirmar. '.repeat(10)}BORRADOR · REVISIÓN HUMANA OBLIGATORIA`])),
  preguntas_pendientes: ['¿Qué proceso se revisará?', '¿Qué entradas están disponibles?', '¿Quién validará la propuesta?'],
  side_effects: false, stored: false, sent: false, implemented: false,
};
const job = { id: '04bf0ebe-fd8c-4253-a4a6-ec2eed6ebfb2', kind: 'document_pack_draft', brief: briefFromPlan(plan), attempt: 1, leaseToken: token, leaseExpiresAt: Math.floor(Date.now() / 1000) + 600 };
describe('document drafting contract', () => {
  it('requires exactly six drafts and forbids claims, PII and side effects', () => {
    expect(DocumentResult.safeParse(result).success).toBe(true);
    for (const unsafe of ['contacta a maria@example.test', 'garantizamos el ahorro', 'coste 999 €', 'cumple RGPD']) {
      expect(DocumentResult.safeParse({ ...result, documents: { ...result.documents, prd: `${result.documents.prd} ${unsafe}` } }).success).toBe(false);
    }
    expect(DocumentResult.safeParse({ ...result, implemented: true }).success).toBe(false);
    expect(DocumentResult.safeParse({ ...result, documents: { ...result.documents, extra: 'no' } }).success).toBe(false);
    expect(() => briefFromPlan({ ...plan, objective: 'Envía a maria@example.test' })).toThrow();
  });
  it('rejects remote HTTP, embedded credentials and untrusted webhook destinations', () => {
    for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com?token=test']) {
      expect(() => workerConfiguration({ VARINO_CONTROL_URL: url, VARINO_DOCUMENT_WORKER_TOKEN: token, VARINO_N8N_DOCUMENT_TOKEN: token })).toThrow();
    }
    expect(config.n8nUrl).toBe('http://127.0.0.1:5679/webhook/document-pack-draft');
  });
});
describe('outbound local worker', () => {
  it('does nothing when the queue is empty', async () => {
    const requests = [];
    const fetcher = async (...args) => { requests.push(args); return Response.json({ job: null }); };
    expect(await runDocumentWorkerOnce(config, { fetcher })).toEqual({ status: 'idle' });
    expect(requests).toHaveLength(1);
  });
  it('calls only the fixed local n8n route and retries identical completion, not inference', async () => {
    const requests = [];
    let reports = 0;
    const fetcher = async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith('/claim')) return Response.json({ job });
      if (url === config.n8nUrl) return Response.json(result);
      reports += 1;
      if (reports === 1) throw new Error('lost acknowledgement');
      return Response.json({ accepted: true, status: 'completed' });
    };
    expect((await runDocumentWorkerOnce(config, { fetcher, sleep: async () => {} })).status).toBe('completed');
    expect(requests.filter((request) => request.url === config.n8nUrl)).toHaveLength(1);
    expect(requests[2].options.body).toBe(requests[3].options.body);
    expect(JSON.parse(requests[1].options.body)).toEqual({ brief: job.brief });
    expect(requests.every((request) => request.options.redirect === 'error')).toBe(true);
  });
  it('does not accept arbitrary job kinds or unsafe output', async () => {
    let n8nCalls = 0;
    await expect(runDocumentWorkerOnce(config, { fetcher: async () => Response.json({ job: { ...job, kind: 'send_email' } }) })).rejects.toThrow();
    const fetcher = async (url, options) => {
      if (url.endsWith('/claim')) return Response.json({ job });
      if (url === config.n8nUrl) { n8nCalls += 1; return Response.json({ ...result, sent: true }); }
      expect(JSON.parse(options.body).errorCode).toBe('invalid_output');
      return Response.json({ accepted: true, status: 'pending' });
    };
    expect((await runDocumentWorkerOnce(config, { fetcher })).status).toBe('pending');
    expect(n8nCalls).toBe(1);
  });
});
