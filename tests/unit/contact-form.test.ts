import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicContactConfig, contactReceipt, contactJson, contactChallenge } from '../../src/lib/contact-form.mjs';
import { CONTACT_NOTICE_VERSION } from '../../src/lib/inbound-contract.mjs';
import { siteCspDirectives, siteCspHeader, TURNSTILE_ORIGIN } from '../../src/lib/content-security-policy.mjs';
import { onRequest } from '../../functions/api/briefings/config';

const local = { enabled: true, mode: 'local-test', noticeVersion: CONTACT_NOTICE_VERSION };
const production = { ...local, mode: 'production', siteKey: 'site_key_fixture_not_a_real_key' };
const receipt = { ok: true, receiptId: '04bf0ebe-fd8c-4253-a4a6-ec2eed6ebfb2', duplicate: false, status: 'received', crmConfirmed: false };

afterEach(() => { delete (window as any).turnstile; vi.restoreAllMocks(); });
describe('public contact capabilities and receipts', () => {
  it('keeps test mode on explicit HTTP loopback and rejects remote, HTTPS and extra fields', () => {
    expect(publicContactConfig(local, 'http://127.0.0.1:4411/contacto/')).toEqual(local);
    for (const url of ['https://varinoai.me/contacto/', 'http://remote.test/contacto/', 'https://localhost/contacto/']) expect(publicContactConfig(local, url)).toBeNull();
    expect(publicContactConfig({ ...local, endpoint: 'https://attacker.test' }, 'http://localhost/contacto/')).toBeNull();
    expect(publicContactConfig({ ...local, noticeVersion: 'old' }, 'http://localhost/contacto/')).toBeNull();
  });
  it('production requires HTTPS and a nontest public site key, not a supplied endpoint', () => {
    expect(publicContactConfig(production, 'https://varinoai.me/contacto/')).toEqual(production);
    expect(publicContactConfig(production, 'http://localhost/contacto/')).toBeNull();
    for (const siteKey of ['', '1x00000000000000000000AA', 11111111111111111111]) expect(publicContactConfig({ ...production, siteKey }, 'https://varinoai.me/contacto/')).toBeNull();
    expect(publicContactConfig({ ...production, secret: 'not-public' }, 'https://varinoai.me/contacto/')).toBeNull();
  });
  it('accepts only the durable 202 receipt contract, never a generic ok or returned PII', () => {
    expect(contactReceipt(receipt, 202)).toEqual(receipt);
    for (const body of [{ ok: true }, { ...receipt, receiptId: '<script>' }, { ...receipt, email: 'someone@test.invalid' }, { ...receipt, duplicate: 'true' }, { ...receipt, crmConfirmed: 1 }]) expect(contactReceipt(body, 202)).toBeNull();
    expect(contactReceipt(receipt, 200)).toBeNull();
  });
  it('bounds responses and requires JSON content type', async () => {
    expect(await contactJson(Response.json(local))).toEqual(local);
    await expect(contactJson(new Response('<html>'))).rejects.toThrow('invalid_response');
    await expect(contactJson(new Response('x'.repeat(4097), { headers: { 'content-type': 'application/json' } }))).rejects.toThrow('invalid_response');
    await expect(contactJson(Response.json(local), 10)).rejects.toThrow('invalid_response');
  });
  it('public config never releases secrets or allows a runtime flag to bypass prelaunch', async () => {
    const env = { VARINO_DB: {} as any, APP_BASE_URL: 'https://varinoai.me/', AGENCY_WORKSPACE_ID: 'fixture', LEAD_WORKER_TOKEN_HASH: 'a'.repeat(64),
      INBOUND_RATE_SECRET: 'b'.repeat(32), INBOUND_CAPTURE_ENABLED: '1', INBOUND_MODE: 'production',
      INBOUND_REVIEWED_NOTICE_VERSION: CONTACT_NOTICE_VERSION, TURNSTILE_SECRET: 'private_secret_fixture_only', TURNSTILE_SITE_KEY: production.siteKey };
    const result = await onRequest({ request: new Request('https://varinoai.me/api/briefings/config'), env });
    expect(await result.json()).toEqual({ enabled: false }); expect(result.headers.get('cache-control')).toContain('no-store');
    expect((await onRequest({ request: new Request('https://varinoai.me/api/briefings/config', { method: 'POST' }), env })).status).toBe(405);
  });
});
describe('challenge and content security', () => {
  it('makes no third-party request for the explicit local synthetic challenge', async () => {
    const before = document.querySelectorAll('script').length;
    expect(await contactChallenge(local, document.createElement('div'), document)).toBe('XXXX.DUMMY.TOKEN.XXXX');
    expect(document.querySelectorAll('script')).toHaveLength(before);
  });
  it('requests fresh widgets with the contact action and never passes contact details (provider simulated)', async () => {
    const options = []; const removed = [];
    (window as any).turnstile = { ready: (callback) => callback(), render: (_container, config) => {
      options.push(config); queueMicrotask(() => config.callback('fresh_fixture_' + options.length)); return 'widget_' + options.length;
    }, remove: (id) => removed.push(id) };
    const container = document.createElement('div');
    expect(await contactChallenge(production, container, document)).toBe('fresh_fixture_1');
    expect(await contactChallenge(production, container, document)).toBe('fresh_fixture_2');
    expect(options[0].action).toBe('contact'); expect(options[0]['response-field']).toBe(false);
    expect(Object.keys(options[0])).not.toContain('email'); expect(removed).toEqual(['widget_1', 'widget_2']);
  });
  it('handles an expired or failed widget without accepting its token (provider simulated)', async () => {
    (window as any).turnstile = { ready: (callback) => callback(), render: (_container, config) => { queueMicrotask(() => config['expired-callback']()); return 'widget'; }, remove: () => {} };
    await expect(contactChallenge(production, document.createElement('div'), document)).rejects.toThrow('challenge_unavailable');
  });
  it('does not widen prelaunch CSP; future policy permits only the fixed challenge script/frame origin', () => {
    expect(siteCspHeader()).not.toContain(TURNSTILE_ORIGIN);
    expect(siteCspHeader(false)).not.toMatch(/unsafe|\*/);
    const policy = siteCspHeader(true);
    expect(policy).toContain(`script-src 'self' ${TURNSTILE_ORIGIN}`);
    expect(policy).toContain(`frame-src ${TURNSTILE_ORIGIN}`);
    expect(policy).toContain("connect-src 'self'"); expect(policy).not.toMatch(/unsafe|\*/);
    expect(siteCspDirectives(true).join('; ')).not.toContain('frame-ancestors');
  });
});
