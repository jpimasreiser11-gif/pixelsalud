import { z } from 'zod';
import { DocumentResult } from '../../../src/lib/autopilot/document-contract.mjs';
import { jsonResponse, sha256Hex, type PagesFunction } from '../../_lib/http';
import { authorizeWorker, readBoundedJson, bodyError, isJsonRequest, equalHash, type DocumentEnvironment } from '../../_lib/document-jobs';

const Common = { jobId: z.string().uuid(), leaseToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) };
const Input = z.union([
  z.strictObject({ ...Common, result: DocumentResult }),
  z.strictObject({ ...Common, errorCode: z.enum(['local_unavailable', 'invalid_output', 'worker_failed']) }),
]);
type Job = { status: string; attempt_count: number; lease_hash: string; lease_expires_at: number | null; result_hash: string | null };
export const onRequest: PagesFunction<DocumentEnvironment> = async ({ request, env }) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  try {
    const rejected = await authorizeWorker(request, env);
    if (rejected) return rejected;
    if (!isJsonRequest(request)) return jsonResponse({ error: 'json_required' }, 415);
    let input;
    try { input = Input.parse(await readBoundedJson(request, 80000)); } catch (error) { return bodyError(error); }
    const leaseHash = await sha256Hex(input.leaseToken);
    const resultHash = await sha256Hex(JSON.stringify('result' in input ? input.result : input.errorCode));
    const findJob = () => env.VARINO_DB.prepare(`SELECT status, attempt_count, lease_hash, lease_expires_at, result_hash FROM document_jobs
      WHERE id = ? AND workspace_id = ?`).bind(input.jobId, env.AGENCY_WORKSPACE_ID).first<Job>();
    const job = await findJob();
    if (!job || !equalHash(leaseHash, job.lease_hash ?? '')) return jsonResponse({ error: 'lease_invalid' }, 409);
    if (job.result_hash && equalHash(resultHash, job.result_hash)) return jsonResponse({ accepted: true, duplicate: true, status: job.status });
    const now = Math.floor(Date.now() / 1000);
    if (job.status !== 'claimed' || (job.lease_expires_at ?? 0) <= now) return jsonResponse({ error: 'lease_expired' }, 409);
    const success = 'result' in input;
    const status = success ? 'completed' : job.attempt_count >= 3 ? 'manual_review' : 'pending';
    const results = await env.VARINO_DB.batch([
      env.VARINO_DB.prepare(`UPDATE document_jobs SET status = ?, result_json = ?, result_hash = ?, error_code = ?,
        lease_expires_at = NULL, not_before = ?, updated_at = ?
        WHERE id = ? AND workspace_id = ? AND status = 'claimed' AND lease_hash = ? AND lease_expires_at > ?`)
        .bind(status, 'result' in input ? JSON.stringify(input.result) : null, resultHash, 'errorCode' in input ? input.errorCode : null,
          now + (success ? 0 : 30 * 2 ** (job.attempt_count - 1)), now, input.jobId, env.AGENCY_WORKSPACE_ID, leaseHash, now),
      env.VARINO_DB.prepare(`INSERT INTO audit_events (id, workspace_id, action, resource_type, resource_id, metadata_json, created_at)
        SELECT ?, workspace_id, 'document_job.result', 'document_job', id, ?, ? FROM document_jobs
        WHERE id = ? AND workspace_id = ? AND result_hash = ? ON CONFLICT(id) DO NOTHING`)
        .bind(`document-result-${input.jobId}-${job.attempt_count}`, JSON.stringify({ status, attempt: job.attempt_count, draftOnly: true }), now, input.jobId, env.AGENCY_WORKSPACE_ID, resultHash),
    ]);
    if (results[0].meta.changes !== 1) {
      const concurrent = await findJob();
      if (concurrent?.result_hash === resultHash && concurrent.lease_hash === leaseHash) return jsonResponse({ accepted: true, duplicate: true, status: concurrent.status });
      return jsonResponse({ error: 'lease_invalid' }, 409);
    }
    return jsonResponse({ accepted: true, duplicate: false, status, humanReviewRequired: true });
  } catch { return jsonResponse({ error: 'service_unavailable' }, 503); }
};
