import { IssueUnsubscribe } from '../../../src/lib/unsubscribe-contract.mjs';
import { jsonResponse, type PagesFunction } from '../../_lib/http';
import { bodyError, isJsonRequest, readBoundedJson } from '../../_lib/document-jobs';
import { authorizeSuppressionWorker, localSuppressionTest, recipientKey, type SuppressionEnvironment } from '../../_lib/suppression';

export const onRequest: PagesFunction<SuppressionEnvironment> = async ({ request, env }) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  try {
    const rejected = await authorizeSuppressionWorker(request, env, 'check');
    if (rejected) return rejected;
    if (!isJsonRequest(request)) return jsonResponse({ error: 'json_required' }, 415);
    let input;
    try { input = IssueUnsubscribe.parse(await readBoundedJson(request, 512)); } catch (error) { return bodyError(error); }
    if (localSuppressionTest(env) && !input.email.endsWith('.test')) return jsonResponse({ error: 'synthetic_data_required' }, 400);
    // Default D1 binding reads the primary; do not introduce eventual-consistency replicas here.
    const saved = await env.VARINO_DB.prepare('SELECT event_id FROM mail_suppressions WHERE workspace_id=? AND recipient_key=? LIMIT 1')
      .bind(env.AGENCY_WORKSPACE_ID, await recipientKey(input.email, env)).first();
    return jsonResponse({ suppressed: Boolean(saved) });
  } catch { return jsonResponse({ error: 'service_unavailable' }, 503); }
};
