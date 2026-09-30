import { beginGoogleLogin, pkceChallenge } from "../../../_lib/google-oidc";
import {
  type AuthEnvironment,
  type PagesFunction,
  configuredBaseUrl,
  consumeGoogleLoginStartLimit,
  isAuthConfigured,
  jsonResponse,
  oauthCallbackUrl,
  requestHasExpectedOrigin,
  setStateCookie,
} from "../../../_lib/http";

export const onRequest: PagesFunction<AuthEnvironment> = async ({ request, env }) => {
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, { allow: "POST" });
  if (!isAuthConfigured(env)) return jsonResponse({ error: "sign_in_unavailable" }, 503);
  if (!requestHasExpectedOrigin(request, env)) return jsonResponse({ error: "origin_not_allowed" }, 403);

  const limit = await consumeGoogleLoginStartLimit(request, env);
  if (!limit.allowed && limit.status === 429) {
    return jsonResponse({ error: "rate_limited" }, 429, { "retry-after": String(limit.retryAfterSeconds) });
  }
  if (!limit.allowed) return jsonResponse({ error: "rate_limit_unavailable" }, 503);

  const baseUrl = configuredBaseUrl(env)!;
  const clientId = env.GOOGLE_CLIENT_ID!.trim();
  const stateSecret = env.OAUTH_STATE_SECRET!;
  const flow = await beginGoogleLogin(stateSecret);
  const authorizationUrl = flow.authorizationUrl;
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: oauthCallbackUrl(baseUrl),
    response_type: "code",
    scope: "openid email profile",
    state: flow.state.state,
    nonce: flow.state.nonce,
    code_challenge: await pkceChallenge(flow.state.codeVerifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  return jsonResponse(
    { authorizationUrl: authorizationUrl.toString() },
    200,
    { "set-cookie": setStateCookie(flow.cookie, baseUrl) },
  );
};
