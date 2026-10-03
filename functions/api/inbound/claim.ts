import { z } from 'zod';
import { jsonResponse, randomToken, sha256Hex, type PagesFunction } from '../../_lib/http';
import { bodyError, isJsonRequest, readBoundedJson } from '../../_lib/document-jobs';
import { authorizeInboundWorker, maintainInbound, type InboundEnvironment } from '../../_lib/inbound';

export const onRequest: PagesFunction<InboundEnvironment> = async ({ request, env }) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  try {
    const rejected = await authorizeInboundWorker(request, env);
    if (rejected) return rejected;
    if (!isJsonRequest(request)) return jsonResponse({ error: 'json_required' }, 415);
    try { z.strictObject({}).parse(await readBoundedJson(request, 256)); } catch (error) { return bodyError(error); }
    const now = Math.floor(Date.now() / 1000);
    await maintainInbound(env, now);
    const leaseToken = randomToken();
    const job = await env.VARINO_DB.prepare(`UPDATE inbound_requests SET status = 'claimed', lease_hash = ?, lease_expires_at = ?, updated_at = ?
      WHERE id = (SELECT r.id FROM inbound_requests r JOIN workspaces w ON w.id = r.workspace_id AND w.status = 'active'
        WHERE r.workspace_id = ? AND r.status = 'pending' AND r.payload_expires_at > ?
        AND NOT EXISTS(SELECT 1 FROM inbound_requests WHERE workspace_id = ? AND status = 'claimed')
        ORDER BY r.received_at,r.id LIMIT 1)
      RETURNING id,payload_json`).bind(await sha256Hex(leaseToken), now + 600, now, env.AGENCY_WORKSPACE_ID, now, env.AGENCY_WORKSPACE_ID)
      .first<{ id: string; payload_json: string }>();
    return jsonResponse({ job: job ? { id: job.id, kind: 'crm_lead_ingest', lead: JSON.parse(job.payload_json), leaseToken, leaseExpiresAt: now + 600 } : null });
  } catch { return jsonResponse({ error: 'service_unavailable' }, 503); }
};
