import { z } from 'zod';
import { jsonResponse, randomToken, sha256Hex, type PagesFunction } from '../../_lib/http';
import { authorizeWorker, readBoundedJson, bodyError, isJsonRequest, type DocumentEnvironment } from '../../_lib/document-jobs';

export const onRequest: PagesFunction<DocumentEnvironment> = async ({ request, env }) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  try {
    const rejected = await authorizeWorker(request, env);
    if (rejected) return rejected;
    if (!isJsonRequest(request)) return jsonResponse({ error: 'json_required' }, 415);
    try { z.strictObject({}).parse(await readBoundedJson(request, 256)); } catch (error) { return bodyError(error); }
    const now = Math.floor(Date.now() / 1000);
    await env.VARINO_DB.prepare(`UPDATE document_jobs SET status = 'manual_review', error_code = 'lease_expired', lease_expires_at = NULL, updated_at = ?
      WHERE workspace_id = ? AND status = 'claimed' AND lease_expires_at <= ? AND attempt_count >= 3`)
      .bind(now, env.AGENCY_WORKSPACE_ID, now).run();
    const leaseToken = randomToken();
    const hash = await sha256Hex(leaseToken);
    // A single conditional UPDATE ... RETURNING, not a select-then-update race.
    const job = await env.VARINO_DB.prepare(`UPDATE document_jobs SET status = 'claimed', attempt_count = attempt_count + 1,
      lease_hash = ?, lease_expires_at = ?, result_hash = NULL, error_code = NULL, updated_at = ?
      WHERE id = (SELECT j.id FROM document_jobs j
        JOIN workspaces w ON w.id = j.workspace_id AND w.status = 'active'
        JOIN automations a ON a.id = j.automation_id AND a.workspace_id = j.workspace_id AND a.deleted_at IS NULL
        JOIN workspace_members wm ON wm.workspace_id = j.workspace_id AND wm.user_id = j.requested_by_user_id AND wm.role = 'OWNER' AND wm.status = 'active'
        JOIN users u ON u.id = wm.user_id AND u.status = 'active'
        WHERE j.workspace_id = ? AND j.attempt_count < 3 AND j.not_before <= ?
          AND (j.status = 'pending' OR (j.status = 'claimed' AND j.lease_expires_at <= ?))
        ORDER BY j.created_at, j.id LIMIT 1)
      RETURNING id, brief, attempt_count`).bind(hash, now + 600, now, env.AGENCY_WORKSPACE_ID, now, now)
      .first<{ id: string; brief: string; attempt_count: number }>();
    return jsonResponse({ job: job ? { id: job.id, kind: 'document_pack_draft', brief: job.brief,
      attempt: job.attempt_count, leaseToken, leaseExpiresAt: now + 600 } : null });
  } catch { return jsonResponse({ error: 'service_unavailable' }, 503); }
};
