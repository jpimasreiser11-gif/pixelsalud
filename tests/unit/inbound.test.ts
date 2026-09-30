import { describe, it, expect } from 'vitest';
import { ContactSubmission, contactRecord, CONTACT_NOTICE_VERSION } from '../../src/lib/inbound-contract.mjs';
import { captureConfigured, localInboundTest, verifyInboundChallenge } from '../../functions/_lib/inbound';
import { inboundWorkerConfiguration, runInboundWorkerOnce } from '../../scripts/local-inbound-worker.mjs';

const token = 'a'.repeat(43);
const lead = { submissionId: 'a'.repeat(64), nombre: 'Equipo ficticio', email: 'fixture@example.test', empresa: 'Empresa ficticia',
  whatsapp: '', interes: 'automation-sprint', fuente: 'form-contacto', pagina: '/contacto/', mensaje: 'Consulta sintética',
  privacy_acknowledged: true, noticeVersion: CONTACT_NOTICE_VERSION, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' };
const env = { VARINO_DB: {} as any, APP_BASE_URL: 'http://127.0.0.1:43219', AGENCY_WORKSPACE_ID: 'agency-test',
  LEAD_WORKER_TOKEN_HASH: 'a'.repeat(64), INBOUND_CAPTURE_ENABLED: '1', INBOUND_MODE: 'local-test', INBOUND_RATE_SECRET: 's'.repeat(32) };
const config = inboundWorkerConfiguration({ VARINO_CONTROL_URL: env.APP_BASE_URL, VARINO_LEAD_WORKER_TOKEN: token, VARINO_N8N_LEAD_TOKEN: 'b'.repeat(43) });
const job = { id: '04bf0ebe-fd8c-4253-a4a6-ec2eed6ebfb2', kind: 'crm_lead_ingest', lead: contactRecord(lead), leaseToken: token, leaseExpiresAt: Math.floor(Date.now() / 1000) + 600 };

describe('consent-first inbound contract', () => {
  it('defaults marketing false; excludes challenge from storage; rejects unknown fields and coercion', () => {
    expect(contactRecord(lead).marketing_consent).toBe(false);
    expect(contactRecord(lead)).not.toHaveProperty('turnstileToken');
    for (const change of [{ marketing_consent: 'true' }, { privacy_acknowledged: false }, { noticeVersion: 'outdated' }, { apiKey: 'secret' }, { website: 'spam' }, { mensaje: 'x'.repeat(2001) }]) {
      expect(ContactSubmission.safeParse({ ...lead, ...change }).success).toBe(false);
    }
    expect(ContactSubmission.parse({ ...lead, email: 'FIXTURE@example.test' }).email).toBe('fixture@example.test');
    expect(ContactSubmission.parse({ ...lead, whatsapp: '+34 600-000-000' }).whatsapp).toBe('+34600000000');
    expect(ContactSubmission.safeParse({ ...lead, whatsapp: 'phone12345678' }).success).toBe(false);
  });
  it('cannot enable test bypass for HTTPS, remote HTTP or launch-blocked production', () => {
    expect(captureConfigured(env)).toBe(true);
    for (const url of ['https://varinoai.me/', 'http://example.com/', 'https://localhost/']) {
      expect(localInboundTest({ ...env, APP_BASE_URL: url })).toBe(false);
      expect(captureConfigured({ ...env, APP_BASE_URL: url })).toBe(false);
    }
    expect(captureConfigured({ ...env, INBOUND_MODE: 'production', APP_BASE_URL: 'https://varinoai.me/', INBOUND_REVIEWED_NOTICE_VERSION: CONTACT_NOTICE_VERSION, TURNSTILE_SECRET: 's'.repeat(35) })).toBe(false);
  });
  it('fails closed on challenge errors, wrong host/action and expired or future timestamps', async () => {
    const hosted = { ...env, APP_BASE_URL: 'https://varinoai.me/', INBOUND_MODE: 'production', TURNSTILE_SECRET: 's'.repeat(35) };
    const now = Date.now();
    const good = { success: true, action: 'contact', hostname: 'varinoai.me', challenge_ts: new Date(now).toISOString() };
    const fetcher = async (_url, options) => { expect(options.redirect).toBe('error'); expect(String(options.body)).not.toContain('remoteip'); return Response.json(good); };
    expect(await verifyInboundChallenge('opaque', hosted, fetcher, now)).toBe(true);
    for (const change of [{ success: false }, { hostname: 'attacker.test' }, { action: 'login' }, { challenge_ts: new Date(now - 300001).toISOString() }, { challenge_ts: new Date(now + 6000).toISOString() }]) {
      expect(await verifyInboundChallenge('opaque', hosted, async () => Response.json({ ...good, ...change }), now)).toBe(false);
    }
    expect(await verifyInboundChallenge('opaque', hosted, async () => { throw new Error('offline'); }, now)).toBe(false);
    expect(await verifyInboundChallenge('opaque', hosted, async () => new Response('x'.repeat(8193)), now)).toBe(false);
  });
});
describe('serialized outbound inbound worker', () => {
  it('does not lease when n8n is offline and rejects arbitrary destinations', async () => {
    const calls = [];
    expect(await runInboundWorkerOnce(config, { fetcher: async (...args) => { calls.push(args); throw new Error('offline'); } })).toEqual({ status: 'local_unavailable' });
    expect(calls).toHaveLength(1);
    for (const url of ['http://remote.test', 'https://user:pass@remote.test', 'https://remote.test/path']) {
      expect(() => inboundWorkerConfiguration({ VARINO_CONTROL_URL: url, VARINO_LEAD_WORKER_TOKEN: token, VARINO_N8N_LEAD_TOKEN: token })).toThrow();
    }
    expect(() => inboundWorkerConfiguration({ VARINO_CONTROL_URL: env.APP_BASE_URL, VARINO_LEAD_WORKER_TOKEN: token, VARINO_N8N_LEAD_TOKEN: token })).toThrow('separate_credentials_required');
  });
  it('retries the same acknowledgement but never replays an ambiguous CRM append', async () => {
    let writes = 0; const acknowledgements = [];
    const fetcher = async (url, options) => {
      if (url.endsWith('/healthz')) return Response.json({ status: 'ok' });
      if (url.endsWith('/claim')) return Response.json({ job });
      if (url.endsWith('/webhook/lead')) { writes += 1; throw new Error('write may have happened'); }
      acknowledgements.push(options.body);
      if (acknowledgements.length === 1) throw new Error('lost acknowledgement');
      expect(JSON.parse(options.body).errorCode).toBe('crm_unconfirmed');
      return Response.json({ accepted: true, status: 'manual_review' });
    };
    expect((await runInboundWorkerOnce(config, { fetcher, sleep: async () => {} })).status).toBe('manual_review');
    expect(writes).toBe(1); expect(acknowledgements[0]).toBe(acknowledgements[1]);
  });
  it('requires the exact stable lead ID and rejects executable job kinds', async () => {
    const fetcher = async (url, options) => {
      if (url.endsWith('/healthz')) return Response.json({});
      if (url.endsWith('/claim')) return Response.json({ job });
      if (url.endsWith('/webhook/lead')) return Response.json({ ok: true, leadId: 'L_' + 'b'.repeat(64) });
      expect(JSON.parse(options.body).errorCode).toBe('invalid_response');
      return Response.json({ accepted: true, status: 'manual_review' });
    };
    expect((await runInboundWorkerOnce(config, { fetcher })).status).toBe('manual_review');
    await expect(runInboundWorkerOnce(config, { fetcher: async (url) => url.endsWith('/healthz') ? Response.json({}) : Response.json({ job: { ...job, kind: 'send_email' } }) })).rejects.toThrow();
  });
  it('does not promote an unverified checkbox to a commercial nurturing permission', async () => {
    const fetcher = async (url, options) => {
      if (url.endsWith('/healthz')) return Response.json({});
      if (url.endsWith('/claim')) return Response.json({ job: { ...job, lead: { ...job.lead, marketing_consent: true } } });
      if (url.endsWith('/webhook/lead')) {
        expect(JSON.parse(options.body).marketing_consent).toBe(false);
        return Response.json({ ok: true, leadId: 'L_' + job.lead.submissionId });
      }
      return Response.json({ accepted: true, status: 'crm_confirmed' });
    };
    expect((await runInboundWorkerOnce(config, { fetcher })).status).toBe('crm_confirmed');
  });
});
