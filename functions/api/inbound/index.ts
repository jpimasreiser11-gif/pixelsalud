import { jsonResponse, type PagesFunction } from '../../_lib/http';
import { authorizeInboundOwner, localInboundTest, maintainInbound, type InboundEnvironment } from '../../_lib/inbound';

export const onRequest: PagesFunction<InboundEnvironment> = async ({ request, env }) => {
  if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'GET' });
  try {
    const authorization = await authorizeInboundOwner(request, env);
    if (authorization instanceof Response) return authorization;
    await maintainInbound(env, Math.floor(Date.now() / 1000));
    const { results } = await env.VARINO_DB.prepare(`SELECT id,('L_' || submission_id) AS crmLeadId,service,status,received_at AS receivedAt,
      marketing_consent AS marketingConsent,error_code AS errorCode FROM inbound_requests
      WHERE workspace_id = ? ORDER BY received_at DESC,id DESC LIMIT 50`).bind(env.AGENCY_WORKSPACE_ID).all();
    return jsonResponse({ agencyInternalOnly: true, synthetic: localInboundTest(env), requests: results });
  } catch { return jsonResponse({ error: 'service_unavailable' }, 503); }
};
