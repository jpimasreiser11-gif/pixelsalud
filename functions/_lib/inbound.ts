import { launchReady } from '../../src/lib/launch-config.mjs';
import { CONTACT_NOTICE_VERSION } from '../../src/lib/inbound-contract.mjs';
import { configuredBaseUrl, findSession, jsonResponse, type AuthEnvironment } from './http';
import { authorizeWorker, readBoundedJson } from './document-jobs';

export interface InboundEnvironment extends AuthEnvironment {
  AGENCY_WORKSPACE_ID?: string;
  LEAD_WORKER_TOKEN_HASH?: string;
  INBOUND_CAPTURE_ENABLED?: string;
  INBOUND_MODE?: string;
  INBOUND_REVIEWED_NOTICE_VERSION?: string;
  INBOUND_RATE_SECRET?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
}
export function localInboundTest(env: InboundEnvironment): boolean {
  const base = configuredBaseUrl(env);
  return env.INBOUND_MODE === 'local-test' && base?.protocol === 'http:'
    && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
}
export function inboundConfigured(env: InboundEnvironment): boolean {
  return Boolean(env.VARINO_DB && configuredBaseUrl(env) && /^[a-zA-Z0-9_-]{1,80}$/.test(env.AGENCY_WORKSPACE_ID ?? '')
    && /^[a-f0-9]{64}$/.test(env.LEAD_WORKER_TOKEN_HASH ?? ''));
}
export function captureConfigured(env: InboundEnvironment): boolean {
  if (!inboundConfigured(env) || env.INBOUND_CAPTURE_ENABLED !== '1' || (env.INBOUND_RATE_SECRET?.length ?? 0) < 32) return false;
  if (localInboundTest(env)) return true;
  // A runtime flag cannot override the repository's reviewed public-launch gate.
  return launchReady && env.INBOUND_MODE === 'production' && configuredBaseUrl(env)?.protocol === 'https:'
    && env.INBOUND_REVIEWED_NOTICE_VERSION === CONTACT_NOTICE_VERSION
    && /^[a-zA-Z0-9_-]{20,200}$/.test(env.TURNSTILE_SITE_KEY ?? '')
    && !/^[123]x0000/.test(env.TURNSTILE_SITE_KEY ?? '')
    && /^[a-zA-Z0-9_-]{30,200}$/.test(env.TURNSTILE_SECRET ?? '')
    && !/^[123]x0000/.test(env.TURNSTILE_SECRET ?? '');
}
export function authorizeInboundWorker(request: Request, env: InboundEnvironment) {
  return authorizeWorker(request, { ...env, DOCUMENT_WORKER_TOKEN_HASH: env.LEAD_WORKER_TOKEN_HASH });
}
export async function authorizeInboundOwner(request: Request, env: InboundEnvironment): Promise<Response | { userId: string }> {
  if (!inboundConfigured(env)) return jsonResponse({ error: 'inbound_unavailable' }, 503);
  const session = await findSession(request, env.VARINO_DB);
  if (!session) return jsonResponse({ error: 'unauthorized' }, 401);
  const owner = await env.VARINO_DB.prepare(`SELECT wm.user_id FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.workspace_id = ? AND wm.user_id = ? AND wm.role = 'OWNER' AND wm.status = 'active' AND w.status = 'active' LIMIT 1`)
    .bind(env.AGENCY_WORKSPACE_ID, session.id).first();
  return owner ? { userId: session.id } : jsonResponse({ error: 'agency_owner_required' }, 403);
}
export async function maintainInbound(env: InboundEnvironment, now: number) {
  await env.VARINO_DB.batch([
    // Do not reassign an expired lease: the append may still have happened remotely.
    env.VARINO_DB.prepare(`UPDATE inbound_requests SET status = 'manual_review', error_code = 'lease_expired', lease_expires_at = NULL, updated_at = ?
      WHERE workspace_id = ? AND status = 'claimed' AND lease_expires_at <= ?`).bind(now, env.AGENCY_WORKSPACE_ID, now),
    env.VARINO_DB.prepare(`UPDATE inbound_requests SET payload_json = NULL,
      status = CASE WHEN status = 'crm_confirmed' THEN status ELSE 'expired' END,
      error_code = CASE WHEN status = 'crm_confirmed' THEN error_code ELSE 'payload_expired' END,
      lease_expires_at = NULL, updated_at = ? WHERE workspace_id = ? AND payload_expires_at <= ? AND payload_json IS NOT NULL`)
      .bind(now, env.AGENCY_WORKSPACE_ID, now),
  ]);
}
export async function consumeInboundLimit(request: Request, env: InboundEnvironment, now: number): Promise<Response | null> {
  let address = request.headers.get('cf-connecting-ip') ?? '';
  if (localInboundTest(env)) address = '127.0.0.1';
  if (!address || address.length > 45 || !/^[a-fA-F0-9:.]+$/.test(address)) return jsonResponse({ error: 'service_unavailable' }, 503);
  const window = Math.floor(now / 900) * 900;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.INBOUND_RATE_SECRET!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`inbound:${window}:${address}`));
  const bucket = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  await env.VARINO_DB.prepare('DELETE FROM inbound_rate_limits WHERE expires_at <= ?').bind(now).run();
  const count = await env.VARINO_DB.prepare(`INSERT INTO inbound_rate_limits(bucket_hash,request_count,expires_at) VALUES(?,1,?)
    ON CONFLICT(bucket_hash) DO UPDATE SET request_count = request_count + 1 WHERE request_count < 10 RETURNING request_count`)
    .bind(bucket, window + 900).first();
  return count ? null : jsonResponse({ error: 'rate_limited' }, 429, { 'retry-after': String(window + 900 - now) });
}
export async function verifyInboundChallenge(token: string, env: InboundEnvironment, fetcher = fetch, now = Date.now()): Promise<boolean> {
  if (localInboundTest(env)) return token === 'XXXX.DUMMY.TOKEN.XXXX';
  try {
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET ?? '', response: token }),
    });
    if (!response.ok) return false;
    const result = await readBoundedJson(response, 8192) as { success?: boolean; action?: string; hostname?: string; challenge_ts: string };
    const issued = Date.parse(result.challenge_ts);
    return result.success === true && result.action === 'contact'
      && result.hostname === configuredBaseUrl(env)?.hostname
      && Number.isFinite(issued) && issued <= now + 5000 && issued > now - 300000;
  } catch { return false; }
}
