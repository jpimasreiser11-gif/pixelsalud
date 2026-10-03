import { z } from 'zod';
import { assessWorkflowPlan } from '../../src/lib/autopilot/plan-contract.mjs';
import { briefFromPlan } from '../../src/lib/autopilot/document-contract.mjs';
import { jsonResponse, requestHasExpectedOrigin, type PagesFunction } from '../_lib/http';
import { authorizeAgencyOwner, readBoundedJson, bodyError, isJsonRequest, type DocumentEnvironment } from '../_lib/document-jobs';

const Input = z.strictObject({ automationId: z.string().uuid() });
type Job = { id: string; automation_id: string; status: string; attempt_count: number; created_at: number; updated_at: number; error_code: string | null; result_json: string | null };
function publicJob(job: Job) {
  const result = job.result_json ? JSON.parse(job.result_json) : null;
  return { id: job.id, automationId: job.automation_id, status: job.status, attempts: job.attempt_count,
    createdAt: job.created_at, updatedAt: job.updated_at, errorCode: job.error_code,
    documents: result?.documents ?? null, questions: result?.preguntas_pendientes ?? [],
    model: result?.model ?? null, humanReviewRequired: true, implemented: false };
}
export const onRequest: PagesFunction<DocumentEnvironment> = async ({ request, env }) => {
  if (!['GET', 'POST'].includes(request.method)) return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'GET, POST' });
  try {
    const owner = await authorizeAgencyOwner(request, env);
    if (owner instanceof Response) return owner;
    if (request.method === 'GET') {
      const jobs = await env.VARINO_DB.prepare(`SELECT id, automation_id, status, attempt_count, created_at, updated_at, error_code, result_json
        FROM document_jobs WHERE workspace_id = ? ORDER BY created_at DESC, id DESC LIMIT 20`).bind(env.AGENCY_WORKSPACE_ID).all<Job>();
      return jsonResponse({ jobs: jobs.results.map(publicJob), agencyInternalOnly: true });
    }
    if (!requestHasExpectedOrigin(request, env)) return jsonResponse({ error: 'origin_not_allowed' }, 403);
    if (!isJsonRequest(request)) return jsonResponse({ error: 'json_required' }, 415);
    let body;
    try { body = Input.parse(await readBoundedJson(request)); } catch (error) { return bodyError(error); }
    const version = await env.VARINO_DB.prepare(`SELECT v.id, v.plan_json FROM automation_versions v
      JOIN automations a ON a.workspace_id = v.workspace_id AND a.id = v.automation_id
      WHERE v.workspace_id = ? AND a.id = ? AND a.deleted_at IS NULL AND a.status = 'draft'
      ORDER BY v.version_number DESC LIMIT 1`).bind(env.AGENCY_WORKSPACE_ID, body.automationId).first<{ id: string; plan_json: string }>();
    if (!version) return jsonResponse({ error: 'draft_not_found' }, 404);
    const assessed = assessWorkflowPlan(JSON.parse(version.plan_json));
    if (!assessed.ok) return jsonResponse({ error: 'invalid_plan' }, 400);
    let brief: string;
    try { brief = briefFromPlan(assessed.plan); } catch { return jsonResponse({ error: 'unsafe_brief' }, 400); }
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const results = await env.VARINO_DB.batch([
      env.VARINO_DB.prepare(`INSERT INTO document_jobs (id, workspace_id, automation_id, version_id, requested_by_user_id, brief, not_before, created_at, updated_at)
        SELECT ?, w.id, ?, ?, wm.user_id, ?, ?, ?, ? FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
        WHERE w.id = ? AND wm.user_id = ? AND wm.role = 'OWNER' AND wm.status = 'active' AND w.status = 'active'
          AND (SELECT COUNT(*) FROM document_jobs WHERE workspace_id = w.id AND created_at >= ?) < 20
        ON CONFLICT(workspace_id, version_id) DO NOTHING`)
        .bind(id, body.automationId, version.id, brief, now, now, now, env.AGENCY_WORKSPACE_ID, owner.userId, now - 86400),
      env.VARINO_DB.prepare(`INSERT INTO audit_events (id, workspace_id, actor_user_id, action, resource_type, resource_id, metadata_json, created_at)
        SELECT ?, workspace_id, requested_by_user_id, 'document_job.created', 'document_job', id, '{"draftOnly":true}', ? FROM document_jobs WHERE id = ?`)
        .bind(crypto.randomUUID(), now, id),
    ]);
    const job = await env.VARINO_DB.prepare(`SELECT id, automation_id, status, attempt_count, created_at, updated_at, error_code, result_json
      FROM document_jobs WHERE workspace_id = ? AND version_id = ?`).bind(env.AGENCY_WORKSPACE_ID, version.id).first<Job>();
    if (!job) return jsonResponse({ error: 'document_job_limit' }, 429, { 'retry-after': '3600' });
    const created = results[0].meta.changes === 1;
    return jsonResponse({ created, job: publicJob(job) }, created ? 201 : 200);
  } catch { return jsonResponse({ error: 'service_unavailable' }, 503); }
};
