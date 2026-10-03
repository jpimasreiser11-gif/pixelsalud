import { ConfirmUnsubscribe } from '../../../src/lib/unsubscribe-contract.mjs';
import { jsonResponse, randomToken, requestHasExpectedOrigin, sha256Hex, type PagesFunction } from '../../_lib/http';
import { bodyError, isJsonRequest, readBoundedJson } from '../../_lib/document-jobs';
import { maintainSuppression, suppressionConfigured, type SuppressionEnvironment } from '../../_lib/suppression';

export const onRequest: PagesFunction<SuppressionEnvironment> = async ({ request, env }) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  if (!suppressionConfigured(env)) return jsonResponse({ error: 'suppression_unavailable' }, 503);
  if (!requestHasExpectedOrigin(request, env)) return jsonResponse({ error: 'invalid_origin' }, 403);
  if (!isJsonRequest(request)) return jsonResponse({ error: 'json_required' }, 415);
  try {
    let input;
    try { input = ConfirmUnsubscribe.parse(await readBoundedJson(request, 256)); } catch (error) { return bodyError(error); }
    const now = Math.floor(Date.now() / 1000);
    await maintainSuppression(env, now);
    const hash = await sha256Hex(input.token);
    const saved = await env.VARINO_DB.prepare('SELECT recipient_key,encrypted_email FROM unsubscribe_tokens WHERE token_hash=? AND workspace_id=? AND expires_at>? LIMIT 1')
      .bind(hash, env.AGENCY_WORKSPACE_ID, now).first<{ recipient_key: string; encrypted_email: string | null }>();
    if (!saved) return jsonResponse({ error: 'link_invalid' }, 400);
    const eventId = await sha256Hex(randomToken());
    await env.VARINO_DB.batch([
      env.VARINO_DB.prepare('INSERT INTO mail_suppressions(workspace_id,recipient_key,event_id,requested_at) VALUES(?,?,?,?) ON CONFLICT(workspace_id,recipient_key) DO NOTHING')
        .bind(env.AGENCY_WORKSPACE_ID, saved.recipient_key, eventId, now),
      env.VARINO_DB.prepare('INSERT INTO suppression_outbox(event_id,workspace_id,recipient_key,encrypted_email,payload_expires_at,updated_at) SELECT event_id,workspace_id,recipient_key,?,?,? FROM mail_suppressions WHERE workspace_id=? AND recipient_key=? AND ? IS NOT NULL ON CONFLICT(workspace_id,recipient_key) DO NOTHING')
        .bind(saved.encrypted_email, now + 30 * 86400, now, env.AGENCY_WORKSPACE_ID, saved.recipient_key, saved.encrypted_email),
      env.VARINO_DB.prepare('UPDATE unsubscribe_tokens SET confirmed_at=coalesce(confirmed_at,?),encrypted_email=NULL WHERE token_hash=? AND workspace_id=?')
        .bind(now, hash, env.AGENCY_WORKSPACE_ID),
    ]);
    const verified = await env.VARINO_DB.prepare('SELECT s.event_id FROM mail_suppressions s JOIN suppression_outbox o ON o.event_id=s.event_id WHERE s.workspace_id=? AND s.recipient_key=? LIMIT 1')
      .bind(env.AGENCY_WORKSPACE_ID, saved.recipient_key).first();
    if (!verified) return jsonResponse({ error: 'service_unavailable' }, 503);
    return jsonResponse({ ok: true, status: 'suppressed' });
  } catch { return jsonResponse({ error: 'service_unavailable' }, 503); }
};
