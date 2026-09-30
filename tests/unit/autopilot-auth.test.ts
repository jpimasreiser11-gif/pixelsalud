// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import {
  beginGoogleLogin,
  openOAuthState,
  pkceChallenge,
  sealOAuthState,
  verifyGoogleIdToken,
} from "../../functions/_lib/google-oidc";
import {
  configuredBaseUrl,
  consumeGoogleLoginStartLimit,
  isAuthConfigured,
  requestHasExpectedOrigin,
  setSessionCookie,
  sha256Hex,
} from "../../functions/_lib/http";

describe("base segura de identidad para Autopilot", () => {
  it("cifra y autentica state con vida corta, y rechaza alteración, caducidad y desajuste CSRF", async () => {
    const secret = "test-only-secret-with-at-least-32-bytes";
    const now = Math.floor(Date.now() / 1000);
    const state = { state: "s".repeat(43), nonce: "n".repeat(43), codeVerifier: "v".repeat(64) };
    const encrypted = await sealOAuthState(state, secret, now);
    const tamperedParts = encrypted.split(".");
    tamperedParts[4] = `${tamperedParts[4][0] === "A" ? "B" : "A"}${tamperedParts[4].slice(1)}`;

    expect(await openOAuthState(encrypted, state.state, secret, now + 1)).toEqual(state);
    await expect(openOAuthState(encrypted, "x".repeat(43), secret, now + 1)).rejects.toThrow();
    await expect(openOAuthState(tamperedParts.join("."), state.state, secret, now + 1)).rejects.toThrow();
    await expect(openOAuthState(encrypted, state.state, secret, now + 601)).rejects.toThrow();
  });

  it("crea PKCE S256 correcto y separa el secreto de navegador del token OAuth", async () => {
    const challenge = await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");

    const flow = await beginGoogleLogin("test-only-secret-with-at-least-32-bytes");
    expect(flow.authorizationUrl.origin).toBe("https://accounts.google.com");
    expect(flow.state.codeVerifier).not.toBe(flow.state.state);
    expect(flow.cookie.split(".")).toHaveLength(5);
    expect(flow.cookie).not.toContain(flow.state.codeVerifier);
  });

  it("verifica firma, issuer, audience, nonce y correo confirmado del ID token", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const clientId = "test-client.apps.googleusercontent.com";
    const nonce = "test-nonce";
    const keySet = async () => publicKey;
    const makeToken = (claims: Record<string, unknown> = {}) => new SignJWT({
      sub: "google-sub-123",
      email: "user@example.test",
      email_verified: true,
      nonce,
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("https://accounts.google.com")
      .setAudience(clientId)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    const valid = await verifyGoogleIdToken(await makeToken(), clientId, nonce, keySet);
    expect(valid).toEqual({ subject: "google-sub-123", email: "user@example.test" });
    await expect(verifyGoogleIdToken(await makeToken({ email_verified: false }), clientId, nonce, keySet)).rejects.toThrow();
    await expect(verifyGoogleIdToken(await makeToken({ nonce: "wrong" }), clientId, nonce, keySet)).rejects.toThrow();
    await expect(verifyGoogleIdToken(await makeToken(), "other-client", nonce, keySet)).rejects.toThrow();
    await expect(verifyGoogleIdToken(await makeToken({ sub: "" }), clientId, nonce, keySet)).rejects.toThrow();
  });

  it("falla cerrado con orígenes y variables no seguras, y limita la cookie de sesión", async () => {
    const env = {
      APP_BASE_URL: "https://varinoai.me",
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      OAUTH_STATE_SECRET: "test-only-secret-with-at-least-32-bytes",
    };
    expect(configuredBaseUrl(env)?.origin).toBe("https://varinoai.me");
    expect(isAuthConfigured(env)).toBe(true);
    expect(isAuthConfigured({ ...env, APP_BASE_URL: "https://varinoai.me/unsafe/path" })).toBe(false);
    expect(isAuthConfigured({ ...env, OAUTH_STATE_SECRET: "short" })).toBe(false);
    expect(requestHasExpectedOrigin(new Request("https://varinoai.me/api/workspaces", { headers: { origin: "https://varinoai.me" } }), env)).toBe(true);
    expect(requestHasExpectedOrigin(new Request("https://varinoai.me/api/workspaces", { headers: { origin: "https://attacker.test" } }), env)).toBe(false);
    expect(requestHasExpectedOrigin(new Request("https://attacker.test/api/workspaces", { headers: { origin: "https://varinoai.me" } }), env)).toBe(false);
    expect(setSessionCookie("x".repeat(43), new URL("https://varinoai.me"))).toContain("HttpOnly; SameSite=Lax");
    expect(setSessionCookie("x".repeat(43), new URL("https://varinoai.me"))).toContain("; Secure");
    expect(await sha256Hex("opaque-session-token")).toBe("00f5c39025967a24e513257fc3a8572166ddddaa08809f00fd260414df28ba9f");
  });

  it("exige una IP de borde válida y falla cerrado si no puede consultar el limitador", async () => {
    let databaseCalled = false;
    const env = {
      OAUTH_STATE_SECRET: "test-only-secret-with-at-least-32-bytes",
      VARINO_DB: {
        prepare: () => {
          databaseCalled = true;
          throw new Error("D1 unavailable");
        },
        batch: async () => [],
      },
    };
    const missingIp = new Request("https://varinoai.me/api/auth/google/start", { method: "POST" });
    expect(await consumeGoogleLoginStartLimit(missingIp, env, 1_800_000_000)).toEqual({ allowed: false, status: 503 });
    expect(databaseCalled).toBe(false);

    const invalidIp = new Request("https://varinoai.me/api/auth/google/start", {
      method: "POST",
      headers: { "cf-connecting-ip": "not-an-ip" },
    });
    expect(await consumeGoogleLoginStartLimit(invalidIp, env, 1_800_000_000)).toEqual({ allowed: false, status: 503 });
    expect(databaseCalled).toBe(false);

    const validIp = new Request("https://varinoai.me/api/auth/google/start", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.10" },
    });
    expect(await consumeGoogleLoginStartLimit(validIp, env, 1_800_000_000)).toEqual({ allowed: false, status: 503 });
    expect(databaseCalled).toBe(true);
  });
});
