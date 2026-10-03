import { openOAuthState, verifyGoogleIdToken } from "../../../_lib/google-oidc";
import {
  type AuthEnvironment,
  type PagesFunction,
  clearStateCookie,
  configuredBaseUrl,
  isAuthConfigured,
  jsonResponse,
  oauthCallbackUrl,
  randomToken,
  redirectResponse,
  SESSION_TTL_SECONDS,
  setSessionCookie,
  sha256Hex,
} from "../../../_lib/http";

interface GoogleTokenResponse {
  id_token?: unknown;
}

interface UserRecord {
  id: string;
  email: string;
  status: "active" | "disabled";
}

function appLocation(baseUrl: URL, result: "success" | "failed"): string {
  const target = new URL("/app/", baseUrl);
  target.searchParams.set("auth", result);
  return target.toString();
}

export const onRequest: PagesFunction<AuthEnvironment> = async ({ request, env }) => {
  const baseUrl = configuredBaseUrl(env);
  if (!baseUrl) return jsonResponse({ error: "sign_in_unavailable" }, 503);
  const clearCookie = clearStateCookie(baseUrl);
  if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405, { allow: "GET" });
  if (!isAuthConfigured(env)) return redirectResponse(appLocation(baseUrl, "failed"), 303, clearCookie);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stateCookie = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .filter((part) => part.startsWith("varino_oauth_state=")) ?? [];
  if (!code || code.length > 2048 || !state || state.length > 256 || stateCookie.length !== 1) {
    return redirectResponse(appLocation(baseUrl, "failed"), 303, clearCookie);
  }

  try {
    const encryptedState = stateCookie[0].slice("varino_oauth_state=".length);
    const flow = await openOAuthState(encryptedState, state, env.OAUTH_STATE_SECRET!);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!.trim(),
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: oauthCallbackUrl(baseUrl),
        grant_type: "authorization_code",
        code_verifier: flow.codeVerifier,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenResponse.ok) return redirectResponse(appLocation(baseUrl, "failed"), 303, clearCookie);
    const tokenPayload = await tokenResponse.json() as GoogleTokenResponse;
    if (typeof tokenPayload.id_token !== "string" || tokenPayload.id_token.length > 16_384) {
      return redirectResponse(appLocation(baseUrl, "failed"), 303, clearCookie);
    }
    const identity = await verifyGoogleIdToken(tokenPayload.id_token, env.GOOGLE_CLIENT_ID!.trim(), flow.nonce);
    const now = Math.floor(Date.now() / 1000);
    let user = await env.VARINO_DB.prepare(
      "SELECT id, email, status FROM users WHERE google_subject = ? LIMIT 1",
    ).bind(identity.subject).first<UserRecord>();

    if (!user) {
      const emailOwner = await env.VARINO_DB.prepare(
        "SELECT id FROM users WHERE email = ? COLLATE NOCASE LIMIT 1",
      ).bind(identity.email).first<{ id: string }>();
      // Never silently link a different account just because its email matches.
      if (emailOwner) return redirectResponse(appLocation(baseUrl, "failed"), 303, clearCookie);
      const newUser: UserRecord = { id: crypto.randomUUID(), email: identity.email, status: "active" };
      try {
        await env.VARINO_DB.prepare(`
          INSERT INTO users (id, email, google_subject, email_verified_at, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'active', ?, ?)
        `).bind(newUser.id, identity.email, identity.subject, now, now, now).run();
        user = newUser;
      } catch {
        // A concurrent callback can win the unique subject/email insert.
        user = await env.VARINO_DB.prepare(
          "SELECT id, email, status FROM users WHERE google_subject = ? LIMIT 1",
        ).bind(identity.subject).first<UserRecord>();
        if (!user) return redirectResponse(appLocation(baseUrl, "failed"), 303, clearCookie);
      }
    }
    if (user.status !== "active") return redirectResponse(appLocation(baseUrl, "failed"), 303, clearCookie);

    const sessionToken = randomToken();
    const expiresAt = now + SESSION_TTL_SECONDS;
    await env.VARINO_DB.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, issued_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), user.id, await sha256Hex(sessionToken), now, expiresAt).run();

    return redirectResponse(appLocation(baseUrl, "success"), 303, [clearCookie, setSessionCookie(sessionToken, baseUrl)]);
  } catch {
    // Do not disclose provider responses, tokens, claims, or database details to the browser.
    return redirectResponse(appLocation(baseUrl, "failed"), 303, clearCookie);
  }
};
