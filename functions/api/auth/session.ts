import { findSession, jsonResponse, type AuthEnvironment, type PagesFunction } from "../../_lib/http";

export const onRequest: PagesFunction<AuthEnvironment> = async ({ request, env }) => {
  if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405, { allow: "GET" });
  try {
    const session = await findSession(request, env.VARINO_DB);
    if (!session) return jsonResponse({ authenticated: false }, 401);
    const { results } = await env.VARINO_DB.prepare(`
      SELECT w.id, w.name, wm.role
      FROM workspace_members wm
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = ?
        AND wm.status = 'active'
        AND w.status = 'active'
        AND w.deleted_at IS NULL
      ORDER BY w.created_at ASC
    `).bind(session.id).all<{ id: string; name: string; role: string }>();
    return jsonResponse({
      authenticated: true,
      user: { id: session.id, email: session.email },
      workspaces: results.map(({ id, name, role }) => ({ id, name, role })),
    });
  } catch {
    return jsonResponse({ error: "service_unavailable" }, 503);
  }
};
