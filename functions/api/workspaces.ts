import { z } from "zod";
import {
  type AuthEnvironment,
  findSession,
  jsonResponse,
  type PagesFunction,
  randomToken,
  requestHasExpectedOrigin,
} from "../_lib/http";

const WorkspaceInput = z.object({ name: z.string().trim().min(2).max(80) }).strict();

async function readJsonBounded(request: Request, maxBytes: number): Promise<{ ok: true; value: unknown } | { ok: false; tooLarge?: boolean }> {
  const reader = request.body?.getReader();
  if (!reader) return { ok: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
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

function workspaceSlug(name: string): string {
  const stem = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/g, "") || "workspace";
  return `${stem}-${randomToken(5).toLowerCase()}`;
}

export const onRequest: PagesFunction<AuthEnvironment> = async ({ request, env }) => {
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, { allow: "POST" });
  if (!requestHasExpectedOrigin(request, env)) return jsonResponse({ error: "origin_not_allowed" }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return jsonResponse({ error: "json_required" }, 415);
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4096) return jsonResponse({ error: "request_too_large" }, 413);
  const body = await readJsonBounded(request, 4096);
  if (!body.ok) return jsonResponse({ error: body.tooLarge ? "request_too_large" : "invalid_request" }, body.tooLarge ? 413 : 400);
  const parsed = WorkspaceInput.safeParse(body.value);
  if (!parsed.success) return jsonResponse({ error: "invalid_workspace_name" }, 400);

  try {
    const session = await findSession(request, env.VARINO_DB);
    if (!session) return jsonResponse({ error: "unauthenticated" }, 401);
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const slug = workspaceSlug(parsed.data.name);
    const results = await env.VARINO_DB.batch([
      env.VARINO_DB.prepare(`
        INSERT INTO workspaces (id, name, slug, status, created_at, updated_at)
        SELECT ?, ?, ?, 'active', ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM workspace_members
          WHERE user_id = ? AND status = 'active'
        )
      `).bind(id, parsed.data.name, slug, now, now, session.id),
      env.VARINO_DB.prepare(`
        INSERT INTO workspace_members (workspace_id, user_id, role, status, created_at, updated_at)
        SELECT ?, ?, 'OWNER', 'active', ?, ?
        WHERE EXISTS (SELECT 1 FROM workspaces WHERE id = ?)
          AND NOT EXISTS (
            SELECT 1 FROM workspace_members
            WHERE user_id = ? AND status = 'active'
          )
      `).bind(id, session.id, now, now, id, session.id),
      env.VARINO_DB.prepare(`
        INSERT INTO audit_events (id, workspace_id, actor_user_id, action, resource_type, resource_id, created_at)
        SELECT ?, ?, ?, 'workspace.created', 'workspace', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_id = ? AND user_id = ? AND role = 'OWNER' AND status = 'active'
        )
      `).bind(crypto.randomUUID(), id, session.id, id, now, id, session.id),
    ]);

    if (results[0]?.meta.changes !== 1) {
      const existing = await env.VARINO_DB.prepare(`
        SELECT w.id, w.name, wm.role
        FROM workspace_members wm
        JOIN workspaces w ON w.id = wm.workspace_id
        WHERE wm.user_id = ? AND wm.status = 'active' AND w.status = 'active'
        ORDER BY w.created_at ASC LIMIT 1
      `).bind(session.id).first<{ id: string; name: string; role: string }>();
      if (existing) return jsonResponse({ workspace: existing, created: false }, 200);
      return jsonResponse({ error: "workspace_not_created" }, 409);
    }
    return jsonResponse({ workspace: { id, name: parsed.data.name, role: "OWNER" }, created: true }, 201);
  } catch {
    return jsonResponse({ error: "service_unavailable" }, 503);
  }
};
