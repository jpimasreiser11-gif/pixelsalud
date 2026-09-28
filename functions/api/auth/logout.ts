import {
  type AuthEnvironment,
  clearSessionCookie,
  configuredBaseUrl,
  findSession,
  jsonResponse,
  type PagesFunction,
  requestHasExpectedOrigin,
} from "../../_lib/http";

export const onRequest: PagesFunction<AuthEnvironment> = async ({ request, env }) => {
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, { allow: "POST" });
  if (!requestHasExpectedOrigin(request, env)) return jsonResponse({ error: "origin_not_allowed" }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return jsonResponse({ error: "json_required" }, 415);
  }
  const baseUrl = configuredBaseUrl(env)!;
  try {
    const session = await findSession(request, env.VARINO_DB);
    if (session) {
      await env.VARINO_DB.prepare(
        "UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
      ).bind(Math.floor(Date.now() / 1000), session.sessionId).run();
    }
  } catch {
    return jsonResponse({ error: "service_unavailable" }, 503);
  }
  return jsonResponse({ ok: true }, 200, { "set-cookie": clearSessionCookie(baseUrl) });
};
