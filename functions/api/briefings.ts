import { ContactSubmission, contactRecord, CONTACT_MARKETING_SOURCE } from '../../src/lib/inbound-contract.mjs';
import { jsonResponse, requestHasExpectedOrigin, sha256Hex, type PagesFunction } from '../_lib/http';
import { bodyError, isJsonRequest, readBoundedJson } from '../_lib/document-jobs';
import { captureConfigured, consumeInboundLimit, localInboundTest, maintainInbound, verifyInboundChallenge, type InboundEnvironment } from '../_lib/inbound';

export const onRequest: PagesFunction<InboundEnvironment> = async ({ request, env }) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  if (!captureConfigured(env)) return jsonResponse({ error: 'capture_unavailable' }, 503);
  if (!requestHasExpectedOrigin(request, env)) return jsonResponse({ error: 'invalid_origin' }, 403);
  if (!isJsonRequest(request)) return jsonResponse({ error: 'json_required' }, 415);
  try {
    const now = Math.floor(Date.now() / 1000);
    const limited = await consumeInboundLimit(request, env, now);
    if (limited) return limited;
    let input;
    try { input = ContactSubmission.parse(await readBoundedJson(request)); } catch (error) { return bodyError(error); }
    // Require test addresses/empty phone on loopback; this is not complete free-text DLP.
    if (localInboundTest(env) && (!input.email.endsWith('.test') || input.whatsapp !== '')) return jsonResponse({ error: 'synthetic_data_required' }, 400);
    if (!await verifyInboundChallenge(input.turnstileToken, env)) return jsonResponse({ error: 'challenge_rejected' }, 422);
    await maintainInbound(env, now);
    const record = contactRecord(input);
    const payload = JSON.stringify(record);
    const hash = await sha256Hex(payload);
    const id = crypto.randomUUID();
    const results = await env.VARINO_DB.batch([
      env.VARINO_DB.prepare(`INSERT INTO inbound_requests(id,workspace_id,submission_id,request_hash,payload_json,service,notice_version,
        marketing_consent,marketing_source,received_at,payload_expires_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM workspaces WHERE id = ? AND status = 'active')
        AND (SELECT count(*) FROM inbound_requests WHERE workspace_id = ? AND received_at >= ?) < 100
        ON CONFLICT(workspace_id,submission_id) DO NOTHING`)
        .bind(id, env.AGENCY_WORKSPACE_ID, input.submissionId, hash, payload, input.interes, input.noticeVersion,
          input.marketing_consent ? 1 : 0, input.marketing_consent ? CONTACT_MARKETING_SOURCE : '', now, now + 30 * 86400, now,
          env.AGENCY_WORKSPACE_ID, env.AGENCY_WORKSPACE_ID, now - 86400),
      env.VARINO_DB.prepare(`INSERT INTO audit_events(id,workspace_id,action,resource_type,resource_id,metadata_json,created_at)
        SELECT ?,workspace_id,'inbound.received','inbound_request',id,?,? FROM inbound_requests WHERE id = ?`)
        .bind(`inbound-received-${id}`, JSON.stringify({ noticeVersion: input.noticeVersion, marketingConsent: input.marketing_consent }), now, id),
    ]);
    const saved = await env.VARINO_DB.prepare(`SELECT id,request_hash,status FROM inbound_requests WHERE workspace_id = ? AND submission_id = ?`)
      .bind(env.AGENCY_WORKSPACE_ID, input.submissionId).first<{ id: string; request_hash: string; status: string }>();
    if (!saved) return jsonResponse({ error: 'capture_unavailable' }, 503);
    if (saved.request_hash !== hash) return jsonResponse({ error: 'submission_conflict' }, 409);
    if (saved.status === 'expired') return jsonResponse({ error: 'submission_expired' }, 409);
    // Receipt proves the durable buffer only. It does not prove CRM, notification or mail delivery.
    return jsonResponse({ ok: true, receiptId: saved.id, duplicate: results[0].meta.changes === 0,
      status: 'received', crmConfirmed: saved.status === 'crm_confirmed' }, 202);
  } catch { return jsonResponse({ error: 'service_unavailable' }, 503); }
};
