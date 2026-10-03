import { z } from 'zod';
import { jsonResponse, randomToken, sha256Hex, type PagesFunction } from '../../_lib/http';
import { bodyError, isJsonRequest, readBoundedJson } from '../../_lib/document-jobs';
import { authorizeSuppressionWorker, decryptRecipient, maintainSuppression, type SuppressionEnvironment } from '../../_lib/suppression';

export const onRequest: PagesFunction<SuppressionEnvironment> = async ({ request, env }) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  try {
    const rejected = await authorizeSuppressionWorker(request, env, 'sync');
    if (rejected) return rejected;
    if (!isJsonRequest(request)) return jsonResponse({ error: 'json_required' }, 415);
    try { z.strictObject({}).parse(await readBoundedJson(request, 256)); } catch (error) { return bodyError(error); }
    const now = Math.floor(Date.now() / 1000);
    await maintainSuppression(env, now);
    const token = randomToken();
    const job = await env.VARINO_DB.prepare("UPDATE suppression_outbox SET status='claimed',lease_hash=?,lease_expires_at=?,updated_at=? WHERE event_id=(SELECT event_id FROM suppression_outbox WHERE workspace_id=? AND status='pending' AND payload_expires_at>? AND NOT EXISTS(SELECT 1 FROM suppression_outbox WHERE workspace_id=? AND status='claimed') ORDER BY updated_at,event_id LIMIT 1) RETURNING event_id,recipient_key,encrypted_email")
      .bind(await sha256Hex(token), now + 600, now, env.AGENCY_WORKSPACE_ID, now, env.AGENCY_WORKSPACE_ID)
      .first<{ event_id: string; recipient_key: string; encrypted_email: string }>();
    if (!job) return jsonResponse({ job: null });
    const saved = await env.VARINO_DB.prepare('SELECT requested_at FROM mail_suppressions WHERE event_id=? AND workspace_id=? LIMIT 1')
      .bind(job.event_id, env.AGENCY_WORKSPACE_ID).first<{ requested_at: number }>();
    if (!saved) throw new Error('ledger_missing');
    return jsonResponse({ job: { eventId: job.event_id, kind: 'crm_suppression_sync',
      email: await decryptRecipient(job.encrypted_email, job.recipient_key, env),
      requestedAt: new Date(saved.requested_at * 1000).toISOString(), leaseToken: token, leaseExpiresAt: now + 600 } });
  } catch { return jsonResponse({ error: 'service_unavailable' }, 503); }
};
