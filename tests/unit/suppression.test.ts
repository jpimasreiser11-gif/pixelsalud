import { describe, it, expect } from 'vitest';
import { encryptRecipient, decryptRecipient, recipientKey, suppressionConfigured, issuanceConfigured } from '../../functions/_lib/suppression';
import { ConfirmUnsubscribe, IssueUnsubscribe, tokenFromFragment } from '../../src/lib/unsubscribe-contract.mjs';
import { checkDurableSuppression, runSuppressionWorkerOnce, suppressionWorkerConfiguration } from '../../scripts/local-suppression-worker.mjs';

const env = { VARINO_DB: {} as any, APP_BASE_URL: 'http://127.0.0.1:45100', AGENCY_WORKSPACE_ID: 'agency-test',
  UNSUBSCRIBE_MODE: 'local-test', UNSUBSCRIBE_ISSUANCE_ENABLED: '1',
  UNSUBSCRIBE_ISSUER_TOKEN_HASH: 'a'.repeat(64), UNSUBSCRIBE_SYNC_TOKEN_HASH: 'b'.repeat(64),
  SUPPRESSION_CHECK_TOKEN_HASH: 'c'.repeat(64), SUPPRESSION_PRIVACY_KEY: 's'.repeat(43) };
const token = 'a'.repeat(43);
const config = suppressionWorkerConfiguration({ VARINO_CONTROL_URL: env.APP_BASE_URL,
  VARINO_SUPPRESSION_SYNC_TOKEN: token, VARINO_N8N_UNSUB_TOKEN: 'b'.repeat(43) });
const job = { kind: 'crm_suppression_sync', eventId: 'e'.repeat(64), email: 'fixture@example.test',
  requestedAt: new Date(Date.now() - 1000).toISOString(), leaseToken: token, leaseExpiresAt: Math.floor(Date.now() / 1000) + 600 };

describe('durable opposition contract', () => {
  it('accepts only opaque fragment tokens and bounded non-injectable recipients', () => {
    expect(tokenFromFragment('#token=' + token)).toBe(token);
    for (const fragment of ['?token=' + token, '#token=' + token + '&other=1', '#token=' + token + '&token=' + token,
      '#token=email@example.test', '#token=' + 'a'.repeat(44)]) expect(tokenFromFragment(fragment)).toBeNull();
    expect(IssueUnsubscribe.parse({ email: 'QA+Demo@EXAMPLE.test' }).email).toBe('qa+demo@example.test');
    for (const email of [' qa@example.test', 'qa@example.test\r\nBcc:x@example.test', '=FORMULA', 'x'.repeat(201)])
      expect(IssueUnsubscribe.safeParse({ email }).success).toBe(false);
    expect(ConfirmUnsubscribe.safeParse({ token, email: job.email }).success).toBe(false);
  });
  it('keeps acceptance separate from issuance and scopes separate from each other', () => {
    expect(suppressionConfigured(env)).toBe(true);
    expect(issuanceConfigured(env)).toBe(true);
    expect(suppressionConfigured({ ...env, UNSUBSCRIBE_ISSUANCE_ENABLED: '0' })).toBe(true);
    expect(issuanceConfigured({ ...env, UNSUBSCRIBE_ISSUANCE_ENABLED: '0' })).toBe(false);
    expect(suppressionConfigured({ ...env, UNSUBSCRIBE_SYNC_TOKEN_HASH: env.UNSUBSCRIBE_ISSUER_TOKEN_HASH })).toBe(false);
    for (const url of ['https://varinoai.me/', 'http://remote.test/'])
      expect(suppressionConfigured({ ...env, APP_BASE_URL: url })).toBe(false);
    expect(issuanceConfigured({ ...env, APP_BASE_URL: 'https://varinoai.me/', UNSUBSCRIBE_MODE: 'production' })).toBe(false);
  });
  it('uses keyed workspace-specific identifiers and authenticated application encryption', async () => {
    const key = await recipientKey(job.email, env);
    expect(await recipientKey('FIXTURE@example.test', env)).toBe(key);
    expect(await recipientKey(job.email, { ...env, AGENCY_WORKSPACE_ID: 'other-agency' })).not.toBe(key);
    const encrypted = await encryptRecipient(job.email, key, env);
    expect(encrypted).not.toContain(job.email);
    expect(await decryptRecipient(encrypted, key, env)).toBe(job.email);
    await expect(decryptRecipient(encrypted, 'd'.repeat(64), env)).rejects.toThrow();
    await expect(decryptRecipient(encrypted, key, { ...env, SUPPRESSION_PRIVACY_KEY: 't'.repeat(43) })).rejects.toThrow();
  });
});
describe('mail and sync safety', () => {
  it('checks opposition without treating an unavailable check as permission', async () => {
    const checkConfig = { base: env.APP_BASE_URL, checkToken: token };
    expect((await checkDurableSuppression(checkConfig, job.email, { fetcher: async () => Response.json({ suppressed: true }) })).status).toBe('blocked');
    expect((await checkDurableSuppression(checkConfig, job.email, { fetcher: async () => Response.json({ suppressed: false }) })).status).toBe('clear');
    for (const fetcher of [async () => { throw new Error('offline'); }, async () => Response.json({ suppressed: 'false' }),
      async () => Response.json({ suppressed: false }, { status: 503 }), async () => new Response('x'.repeat(2049))])
      expect((await checkDurableSuppression(checkConfig, job.email, { fetcher })).status).toBe('unavailable');
  });
  it('does not lease while n8n is down and refuses arbitrary destinations/shared credentials', async () => {
    let calls = 0;
    expect(await runSuppressionWorkerOnce(config, { fetcher: async (url) => { calls++; if (url.endsWith('/maintenance')) return Response.json({ ok: true }); throw new Error('offline'); } })).toEqual({ status: 'local_unavailable' });
    expect(calls).toBe(2);
    expect(() => suppressionWorkerConfiguration({ VARINO_CONTROL_URL: 'http://remote.test', VARINO_SUPPRESSION_SYNC_TOKEN: token, VARINO_N8N_UNSUB_TOKEN: token })).toThrow();
    expect(() => suppressionWorkerConfiguration({ VARINO_CONTROL_URL: env.APP_BASE_URL, VARINO_SUPPRESSION_SYNC_TOKEN: token, VARINO_N8N_UNSUB_TOKEN: token })).toThrow('separate_credentials_required');
  });
  it('retries acknowledgements, never ambiguous native writes, and validates the native event receipt', async () => {
    let writes = 0; const reports = [];
    const fetcher = async (url, options) => {
      if (url.endsWith('/maintenance')) return Response.json({ ok: true });
      if (url.endsWith('/healthz')) return Response.json({});
      if (url.endsWith('/claim')) return Response.json({ job });
      if (url.endsWith('/webhook/unsub-sync')) { writes++; throw new Error('ambiguous write'); }
      reports.push(options.body);
      if (reports.length === 1) throw new Error('ack lost');
      expect(JSON.parse(options.body).errorCode).toBe('crm_unconfirmed');
      return Response.json({ accepted: true, status: 'manual_review' });
    };
    expect((await runSuppressionWorkerOnce(config, { fetcher, sleep: async () => {} })).status).toBe('manual_review');
    expect(writes).toBe(1); expect(reports[0]).toBe(reports[1]);
    const mismatch = async (url, options) => {
      if (url.endsWith('/maintenance')) return Response.json({ ok: true });
      if (url.endsWith('/healthz')) return Response.json({});
      if (url.endsWith('/claim')) return Response.json({ job });
      if (url.endsWith('/webhook/unsub-sync')) return Response.json({ ok: true, suppressed: true, duplicate: false, eventId: 'f'.repeat(64) });
      expect(JSON.parse(options.body).errorCode).toBe('invalid_response');
      return Response.json({ accepted: true, status: 'manual_review' });
    };
    expect((await runSuppressionWorkerOnce(config, { fetcher: mismatch })).status).toBe('manual_review');
  });
});
