import { CONTACT_NOTICE_VERSION } from '../../../src/lib/inbound-contract.mjs';
import { configuredBaseUrl, jsonResponse, type PagesFunction } from '../../_lib/http';
import { captureConfigured, localInboundTest, type InboundEnvironment } from '../../_lib/inbound';

export const onRequest: PagesFunction<InboundEnvironment> = async ({ request, env }) => {
  if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'GET' });
  // Public capabilities only, never credentials or contact data. Fail closed.
  if (!captureConfigured(env)) return jsonResponse({ enabled: false });
  const base = configuredBaseUrl(env);
  if (new URL(request.url).origin !== base?.origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    return jsonResponse({ enabled: false }, 403);
  }
  try {
    const active = await env.VARINO_DB.prepare("SELECT id FROM workspaces WHERE id = ? AND status = 'active' LIMIT 1")
      .bind(env.AGENCY_WORKSPACE_ID).first();
    if (!active) return jsonResponse({ enabled: false });
    return jsonResponse({ enabled: true, mode: localInboundTest(env) ? 'local-test' : 'production',
      noticeVersion: CONTACT_NOTICE_VERSION, ...(localInboundTest(env) ? {} : { siteKey: env.TURNSTILE_SITE_KEY }) });
  } catch { return jsonResponse({ enabled: false }); }
};
