import { InboundReport } from '../../../src/lib/inbound-contract.mjs';
import { jsonResponse, sha256Hex, type PagesFunction } from '../../_lib/http';
import { bodyError, equalHash, isJsonRequest, readBoundedJson } from '../../_lib/document-jobs';
import { authorizeInboundWorker, type InboundEnvironment } from '../../_lib/inbound';

type Saved = { submission_id: string; lease_hash: string; result_hash: string | null; status: string; lease_expires_at: number | null };
export const onRequest: PagesFunction<InboundEnvironment> = async ({ request, env }) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  try {
    const rejected = await authorizeInboundWorker(request, env);
    if (rejected) return rejected;
    if (!isJsonRequest(request)) return jsonResponse({ error: 'json_required' }, 415);
    let input;
    try { input = InboundReport.parse(await readBoundedJson(request, 2048)); } catch (error) { return bodyError(error); }
    const leaseHash = await sha256Hex(input.leaseToken);
    const resultHash = await sha256Hex(JSON.stringify('result' in input ? input.result : input.errorCode));
    const lookup = () => env.VARINO_DB.prepare(`SELECT submission_id,lease_hash,result_hash,status,lease_expires_at FROM inbound_requests WHERE id = ? AND workspace_id = ?`)
      .bind(input.jobId, env.AGENCY_WORKSPACE_ID).first<Saved>();
    const saved = await lookup();
    if (!saved || !equalHash(leaseHash, saved.lease_hash ?? '')) return jsonResponse({ error: 'lease_invalid' }, 409);
    if (saved.result_hash === resultHash) return jsonResponse({ accepted: true, duplicate: true, status: saved.status });
    const now = Math.floor(Date.now() / 1000);
    if (saved.status !== 'claimed' || (saved.lease_expires_at ?? 0) <= now) return jsonResponse({ error: 'lease_expired' }, 409);
    if ('result' in input && input.result.leadId !== `L_${saved.submission_id}`) return jsonResponse({ error: 'receipt_mismatch' }, 400);
    const status = 'result' in input ? 'crm_confirmed' : 'manual_review';
    const results = await env.VARINO_DB.batch([
      env.VARINO_DB.prepare(`UPDATE inbound_requests SET status = ?,result_hash = ?,error_code = ?,lease_expires_at = NULL,
        payload_json = CASE WHEN ? = 'crm_confirmed' THEN NULL ELSE payload_json END,updated_at = ?
        WHERE id = ? AND workspace_id = ? AND status = 'claimed' AND lease_hash = ? AND lease_expires_at > ?`)
        .bind(status, resultHash, 'errorCode' in input ? input.errorCode : null, status, now, input.jobId, env.AGENCY_WORKSPACE_ID, leaseHash, now),
      env.VARINO_DB.prepare(`INSERT INTO audit_events(id,workspace_id,action,resource_type,resource_id,metadata_json,created_at)
        SELECT ?,workspace_id,'inbound.result','inbound_request',id,?,? FROM inbound_requests
        WHERE id = ? AND workspace_id = ? AND result_hash = ? ON CONFLICT(id) DO NOTHING`)
        .bind(`inbound-result-${input.jobId}`, JSON.stringify({ status }), now, input.jobId, env.AGENCY_WORKSPACE_ID, resultHash),
    ]);
    if (results[0].meta.changes !== 1) {
      const current = await lookup();
      if (current?.result_hash !== resultHash || current.lease_hash !== leaseHash) return jsonResponse({ error: 'lease_invalid' }, 409);
    }
    return jsonResponse({ accepted: true, duplicate: results[0].meta.changes === 0, status });
  } catch { return jsonResponse({ error: 'service_unavailable' }, 503); }
};
