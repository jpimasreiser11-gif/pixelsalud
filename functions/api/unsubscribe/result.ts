import { SuppressionReport } from '../../../src/lib/unsubscribe-contract.mjs';
import { jsonResponse, sha256Hex, type PagesFunction } from '../../_lib/http';
import { bodyError, equalHash, isJsonRequest, readBoundedJson } from '../../_lib/document-jobs';
import { authorizeSuppressionWorker, type SuppressionEnvironment } from '../../_lib/suppression';

type Saved = { lease_hash: string; result_hash: string | null; status: string; lease_expires_at: number | null };
export const onRequest: PagesFunction<SuppressionEnvironment> = async ({ request, env }) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  try {
    const rejected = await authorizeSuppressionWorker(request, env, 'sync');
    if (rejected) return rejected;
    if (!isJsonRequest(request)) return jsonResponse({ error: 'json_required' }, 415);
    let input;
    try { input = SuppressionReport.parse(await readBoundedJson(request, 1024)); } catch (error) { return bodyError(error); }
    if ('result' in input && input.result.eventId !== input.eventId) return jsonResponse({ error: 'receipt_mismatch' }, 400);
    const leaseHash = await sha256Hex(input.leaseToken);
    const resultHash = await sha256Hex(JSON.stringify('result' in input ? input.result : input.errorCode));
    const lookup = () => env.VARINO_DB.prepare('SELECT lease_hash,result_hash,status,lease_expires_at FROM suppression_outbox WHERE event_id=? AND workspace_id=? LIMIT 1')
      .bind(input.eventId, env.AGENCY_WORKSPACE_ID).first<Saved>();
    const saved = await lookup();
    if (!saved || !equalHash(leaseHash, saved.lease_hash ?? '')) return jsonResponse({ error: 'lease_invalid' }, 409);
    if (saved.result_hash === resultHash) return jsonResponse({ accepted: true, duplicate: true, status: saved.status });
    const now = Math.floor(Date.now() / 1000);
    if (saved.status !== 'claimed' || (saved.lease_expires_at ?? 0) <= now) return jsonResponse({ error: 'lease_expired' }, 409);
    const status = 'result' in input ? 'synced' : 'manual_review';
    const updated = await env.VARINO_DB.prepare("UPDATE suppression_outbox SET status=?,result_hash=?,error_code=?,lease_expires_at=NULL,encrypted_email=CASE WHEN ?='synced' THEN NULL ELSE encrypted_email END,updated_at=? WHERE event_id=? AND workspace_id=? AND status='claimed' AND lease_hash=? AND lease_expires_at>?")
      .bind(status, resultHash, 'errorCode' in input ? input.errorCode : null, status, now, input.eventId, env.AGENCY_WORKSPACE_ID, leaseHash, now).run();
    if (updated.meta.changes !== 1 && (await lookup())?.result_hash !== resultHash) return jsonResponse({ error: 'lease_invalid' }, 409);
    return jsonResponse({ accepted: true, duplicate: updated.meta.changes === 0, status });
  } catch { return jsonResponse({ error: 'service_unavailable' }, 503); }
};
