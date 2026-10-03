import { z } from "zod";
import { containsPrivateData } from "../../src/lib/guide-engine.mjs";
import { assessWorkflowPlan } from "../../src/lib/autopilot/plan-contract.mjs";
import {
  findSession,
  jsonResponse,
  requestHasExpectedOrigin,
  sha256Hex,
  type AuthEnvironment,
  type PagesFunction,
} from "../_lib/http";

const CreateInput = z.strictObject({ plan: z.unknown() });
const MAX_BODY_BYTES = 8 * 1024;
const MAX_AUTOMATIONS_PER_PAGE = 100;
const CREATE_LIMIT_PER_MINUTE = 15;

type WorkspaceMember = {
  id: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
};

type StoredDraft = {
  id: string;
  name: string;
  objective: string;
  status: string;
  autonomy: string;
  created_at: number;
  updated_at: number;
  version_number: number;
  plan_json: string;
  risk_level: "low" | "medium" | "high";
  approval_required: number;
};

async function readJsonBounded(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; tooLarge?: boolean }> {
  const reader = request.body?.getReader();
  if (!reader) return { ok: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, tooLarge: true };
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(body)) };
  } catch {
    return { ok: false };
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function hasPrivateText(value: unknown): boolean {
  if (typeof value === "string") return containsPrivateData(value);
  if (Array.isArray(value)) return value.some(hasPrivateText);
  if (value && typeof value === "object") return Object.values(value).some(hasPrivateText);
  return false;
}

async function findSingleWorkspace(
  env: AuthEnvironment,
  userId: string,
): Promise<{ workspace: WorkspaceMember | null; multiple: boolean }> {
  const result = await env.VARINO_DB.prepare(`
    SELECT w.id, wm.role
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = ? AND wm.status = 'active' AND w.status = 'active'
    ORDER BY w.created_at ASC
    LIMIT 2
  `).bind(userId).all<WorkspaceMember>();
  const rows = result.results ?? [];
  return { workspace: rows[0] ?? null, multiple: rows.length > 1 };
}

async function allowDraftWrite(env: AuthEnvironment, userId: string, now: number): Promise<boolean> {
  const windowStart = Math.floor(now / 60) * 60;
  const result = await env.VARINO_DB.prepare(`
    INSERT INTO api_rate_limits (user_id, action, window_start, request_count)
    VALUES (?, 'automation.draft.create', ?, 1)
    ON CONFLICT (user_id, action) DO UPDATE SET
      window_start = excluded.window_start,
      request_count = CASE
        WHEN api_rate_limits.window_start = excluded.window_start THEN api_rate_limits.request_count + 1
        ELSE 1
      END
    WHERE api_rate_limits.window_start != excluded.window_start
       OR api_rate_limits.request_count < ?
    RETURNING request_count
  `).bind(userId, windowStart, CREATE_LIMIT_PER_MINUTE).first<{ request_count: number }>();
  return result !== null;
}

async function findByIdempotencyKey(
  env: AuthEnvironment,
  workspaceId: string,
  keyHash: string,
): Promise<{ id: string; request_hash: string } | null> {
  return env.VARINO_DB.prepare(`
    SELECT id, request_hash
    FROM automations
    WHERE workspace_id = ? AND idempotency_key_hash = ? AND deleted_at IS NULL
    LIMIT 1
  `).bind(workspaceId, keyHash).first<{ id: string; request_hash: string }>();
}

async function getPublicDraft(env: AuthEnvironment, workspaceId: string, automationId: string): Promise<StoredDraft | null> {
  return env.VARINO_DB.prepare(`
    SELECT a.id, a.name, a.objective, a.status, a.autonomy, a.created_at, a.updated_at,
      v.version_number, v.plan_json, v.risk_level, v.approval_required
    FROM automations a
    JOIN automation_versions v
      ON v.workspace_id = a.workspace_id AND v.automation_id = a.id
    WHERE a.workspace_id = ? AND a.id = ? AND a.deleted_at IS NULL
      AND v.version_number = (
        SELECT MAX(latest.version_number)
        FROM automation_versions latest
        WHERE latest.workspace_id = a.workspace_id AND latest.automation_id = a.id
      )
    LIMIT 1
  `).bind(workspaceId, automationId).first<StoredDraft>();
}

function serializeDraft(draft: StoredDraft) {
  return {
    id: draft.id,
    name: draft.name,
    objective: draft.objective,
    status: draft.status,
    autonomy: draft.autonomy,
    createdAt: draft.created_at,
    updatedAt: draft.updated_at,
    version: draft.version_number,
    plan: JSON.parse(draft.plan_json) as Record<string, unknown>,
    riskLevel: draft.risk_level,
    approvalRequired: draft.approval_required === 1,
    executable: false as const,
  };
}

async function listDrafts(env: AuthEnvironment, workspaceId: string, limit: number): Promise<Response> {
  const result = await env.VARINO_DB.prepare(`
    SELECT a.id, a.name, a.objective, a.status, a.autonomy, a.created_at, a.updated_at,
      v.version_number, v.plan_json, v.risk_level, v.approval_required
    FROM automations a
    JOIN automation_versions v
      ON v.workspace_id = a.workspace_id AND v.automation_id = a.id
    WHERE a.workspace_id = ? AND a.deleted_at IS NULL
      AND v.version_number = (
        SELECT MAX(latest.version_number)
        FROM automation_versions latest
        WHERE latest.workspace_id = a.workspace_id AND latest.automation_id = a.id
      )
    ORDER BY a.updated_at DESC, a.id ASC
    LIMIT ?
  `).bind(workspaceId, limit).all<StoredDraft>();
  return jsonResponse({ automations: (result.results ?? []).map(serializeDraft), executable: false });
}

async function createDraft(
  request: Request,
  env: AuthEnvironment,
  userId: string,
  workspaceId: string,
  plan: Record<string, unknown>,
  riskLevel: "low" | "medium" | "high",
  approvalRequired: boolean,
): Promise<Response> {
  const key = request.headers.get("idempotency-key") ?? "";
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key)) return jsonResponse({ error: "idempotency_key_required" }, 400);

  const keyHash = await sha256Hex(key);
  const planJson = canonicalJson(plan);
  const requestHash = await sha256Hex(planJson);
  const prior = await findByIdempotencyKey(env, workspaceId, keyHash);
  if (prior) {
    if (prior.request_hash !== requestHash) return jsonResponse({ error: "idempotency_conflict" }, 409);
    const existing = await getPublicDraft(env, workspaceId, prior.id);
    return existing
      ? jsonResponse({ created: false, automation: serializeDraft(existing) })
      : jsonResponse({ error: "service_unavailable" }, 503);
  }

  const id = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const autonomy = riskLevel === "low" ? "safe" : "assisted";
  const metadata = JSON.stringify({ riskLevel, approvalRequired, stepCount: Array.isArray(plan.steps) ? plan.steps.length : 0 });
  try {
    const results = await env.VARINO_DB.batch([
      env.VARINO_DB.prepare(`
        INSERT INTO automations (
          id, workspace_id, name, objective, status, autonomy, created_by_user_id,
          created_at, updated_at, idempotency_key_hash, request_hash
        )
        SELECT ?, w.id, ?, ?, 'draft', ?, ?, ?, ?, ?, ?
        FROM workspace_members wm
        JOIN workspaces w ON w.id = wm.workspace_id
        WHERE w.id = ? AND wm.user_id = ? AND wm.status = 'active'
          AND wm.role IN ('OWNER', 'ADMIN', 'MEMBER') AND w.status = 'active'
      `).bind(id, plan.name, plan.objective, autonomy, userId, now, now, keyHash, requestHash, workspaceId, userId),
      env.VARINO_DB.prepare(`
        INSERT INTO automation_versions (
          id, workspace_id, automation_id, version_number, plan_json, risk_level,
          approval_required, created_by_user_id, created_at
        )
        SELECT ?, a.workspace_id, a.id, 1, ?, ?, ?, ?, ?
        FROM automations a
        JOIN workspace_members wm ON wm.workspace_id = a.workspace_id AND wm.user_id = ?
        WHERE a.id = ? AND a.workspace_id = ? AND wm.status = 'active'
      `).bind(versionId, planJson, riskLevel, approvalRequired ? 1 : 0, userId, now, userId, id, workspaceId),
      env.VARINO_DB.prepare(`
        INSERT INTO audit_events (id, workspace_id, actor_user_id, action, resource_type, resource_id, metadata_json, created_at)
        SELECT ?, a.workspace_id, ?, 'automation.draft.created', 'automation', a.id, ?, ?
        FROM automations a
        JOIN automation_versions v ON v.workspace_id = a.workspace_id AND v.automation_id = a.id
        JOIN workspace_members wm ON wm.workspace_id = a.workspace_id AND wm.user_id = ?
        WHERE a.id = ? AND a.workspace_id = ? AND v.id = ? AND wm.status = 'active'
      `).bind(auditId, userId, metadata, now, userId, id, workspaceId, versionId),
    ]);
    if (results.length !== 3 || results.some((result) => result.meta.changes !== 1)) {
      return jsonResponse({ error: "workspace_unavailable" }, 409);
    }
  } catch {
    const concurrent = await findByIdempotencyKey(env, workspaceId, keyHash).catch(() => null);
    if (concurrent) {
      if (concurrent.request_hash !== requestHash) return jsonResponse({ error: "idempotency_conflict" }, 409);
      const existing = await getPublicDraft(env, workspaceId, concurrent.id).catch(() => null);
      if (existing) return jsonResponse({ created: false, automation: serializeDraft(existing) });
    }
    return jsonResponse({ error: "service_unavailable" }, 503);
  }

  const created = await getPublicDraft(env, workspaceId, id);
  return created
    ? jsonResponse({ created: true, automation: serializeDraft(created) }, 201)
    : jsonResponse({ error: "service_unavailable" }, 503);
}

export const onRequest: PagesFunction<AuthEnvironment> = async ({ request, env }) => {
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, { allow: "GET, POST" });
  }
  if (request.method === "POST") {
    if (!requestHasExpectedOrigin(request, env)) return jsonResponse({ error: "origin_not_allowed" }, 403);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return jsonResponse({ error: "json_required" }, 415);
    }
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES) return jsonResponse({ error: "request_too_large" }, 413);
  }

  try {
    const session = await findSession(request, env.VARINO_DB);
    if (!session) return jsonResponse({ error: "unauthenticated" }, 401);

    if (request.method === "GET") {
      const rawLimit = new URL(request.url).searchParams.get("limit");
      const limit = rawLimit === null ? 25 : Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_AUTOMATIONS_PER_PAGE) {
        return jsonResponse({ error: "invalid_limit" }, 400);
      }
      const { workspace, multiple } = await findSingleWorkspace(env, session.id);
      if (multiple) return jsonResponse({ error: "workspace_selection_required" }, 409);
      if (!workspace) return jsonResponse({ error: "workspace_required" }, 409);
      return await listDrafts(env, workspace.id, limit);
    }

    if (!await allowDraftWrite(env, session.id, Math.floor(Date.now() / 1000))) {
      return jsonResponse({ error: "rate_limited" }, 429, { "retry-after": "60" });
    }
    const body = await readJsonBounded(request);
    if (!body.ok) return jsonResponse({ error: body.tooLarge ? "request_too_large" : "invalid_request" }, body.tooLarge ? 413 : 400);
    const parsedBody = CreateInput.safeParse(body.value);
    if (!parsedBody.success) return jsonResponse({ error: "invalid_request" }, 400);

    const assessed = assessWorkflowPlan(parsedBody.data.plan);
    if (!assessed.ok) return jsonResponse({ error: "invalid_plan" }, 400);
    if (hasPrivateText(assessed.plan)) return jsonResponse({ error: "private_data_blocked" }, 400);

    const { workspace, multiple } = await findSingleWorkspace(env, session.id);
    if (multiple) return jsonResponse({ error: "workspace_selection_required" }, 409);
    if (!workspace) return jsonResponse({ error: "workspace_required" }, 409);
    if (workspace.role === "VIEWER") return jsonResponse({ error: "permission_denied" }, 403);

    return await createDraft(
      request,
      env,
      session.id,
      workspace.id,
      assessed.plan,
      assessed.riskLevel,
      assessed.minimumHumanApproval,
    );
  } catch {
    return jsonResponse({ error: "service_unavailable" }, 503);
  }
};
