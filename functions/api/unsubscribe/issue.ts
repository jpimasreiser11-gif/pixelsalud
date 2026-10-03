import { IssueUnsubscribe } from '../../../src/lib/unsubscribe-contract.mjs';
import { configuredBaseUrl, jsonResponse, randomToken, sha256Hex, type PagesFunction } from '../../_lib/http';
import { bodyError, isJsonRequest, readBoundedJson } from '../../_lib/document-jobs';
import { authorizeSuppressionWorker, encryptRecipient, issuanceConfigured, localSuppressionTest, maintainSuppression, recipientKey, type SuppressionEnvironment } from '../../_lib/suppression';

export const onRequest: PagesFunction<SuppressionEnvironment> = async ({ request, env }) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  try {
    const rejected = await authorizeSuppressionWorker(request, env, 'issue');
    if (rejected) return rejected;
    if (!issuanceConfigured(env)) return jsonResponse({ error: 'issuance_unavailable' }, 503);
    if (!isJsonRequest(request)) return jsonResponse({ error: 'json_required' }, 415);
    let input;
    try { input = IssueUnsubscribe.parse(await readBoundedJson(request, 512)); } catch (error) { return bodyError(error); }
    if (localSuppressionTest(env) && !input.email.endsWith('.test')) return jsonResponse({ error: 'synthetic_data_required' }, 400);
    const now = Math.floor(Date.now() / 1000);
    await maintainSuppression(env, now);
    const key = await recipientKey(input.email, env);
    const blocked = await env.VARINO_DB.prepare('SELECT event_id FROM mail_suppressions WHERE workspace_id=? AND recipient_key=? LIMIT 1')
      .bind(env.AGENCY_WORKSPACE_ID, key).first();
    if (blocked) return jsonResponse({ error: 'recipient_suppressed' }, 409);
    const token = randomToken();
    const saved = await env.VARINO_DB.prepare('INSERT INTO unsubscribe_tokens(token_hash,workspace_id,recipient_key,encrypted_email,issued_at,expires_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM workspaces WHERE id=? AND status=\'active\') AND (SELECT count(*) FROM unsubscribe_tokens WHERE workspace_id=? AND issued_at>=?)<1000')
      .bind(await sha256Hex(token), env.AGENCY_WORKSPACE_ID, key, await encryptRecipient(input.email, key, env), now, now + 365 * 86400,
        env.AGENCY_WORKSPACE_ID, env.AGENCY_WORKSPACE_ID, now - 86400).run();
    if (saved.meta.changes !== 1) return jsonResponse({ error: 'issuance_unavailable' }, 503);
    const url = new URL('/baja/', configuredBaseUrl(env)!);
    url.hash = 'token=' + token;
    // This is a link, not permission to send; no email or raw token is logged/persisted.
    return jsonResponse({ unsubscribeUrl: url.href }, 201);
  } catch { return jsonResponse({ error: 'service_unavailable' }, 503); }
};
