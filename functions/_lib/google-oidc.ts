import { createRemoteJWKSet, EncryptJWT, jwtDecrypt, jwtVerify } from "jose";
import { OAUTH_TTL_SECONDS, randomToken } from "./http";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const encoder = new TextEncoder();

export interface OAuthState {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface GoogleIdentity {
  subject: string;
  email: string;
}

async function stateEncryptionKey(secret: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(secret)));
}

export async function sealOAuthState(data: OAuthState, secret: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  return new EncryptJWT({ state: data.state, nonce: data.nonce, codeVerifier: data.codeVerifier })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "JWT" })
    .setIssuer("varino-auth")
    .setAudience("google-oauth-callback")
    .setIssuedAt(now)
    .setExpirationTime(now + OAUTH_TTL_SECONDS)
    .encrypt(await stateEncryptionKey(secret));
}

export async function openOAuthState(token: string, expectedState: string, secret: string, now?: number): Promise<OAuthState> {
  const { payload, protectedHeader } = await jwtDecrypt(token, await stateEncryptionKey(secret), {
    issuer: "varino-auth",
    audience: "google-oauth-callback",
    keyManagementAlgorithms: ["dir"],
    contentEncryptionAlgorithms: ["A256GCM"],
    ...(now === undefined ? {} : { currentDate: new Date(now * 1000) }),
    maxTokenAge: `${OAUTH_TTL_SECONDS}s`,
  });
  const state = payload.state;
  const nonce = payload.nonce;
  const codeVerifier = payload.codeVerifier;
  if (
    typeof state !== "string"
    || typeof nonce !== "string"
    || typeof codeVerifier !== "string"
    || protectedHeader.typ !== "JWT"
    || state !== expectedState
    || !/^[A-Za-z0-9_-]{40,60}$/.test(state)
    || !/^[A-Za-z0-9_-]{40,60}$/.test(nonce)
    || !/^[A-Za-z0-9_-]{43,128}$/.test(codeVerifier)
  ) {
    throw new Error("Invalid OAuth state");
  }
  return { state, nonce, codeVerifier };
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function beginGoogleLogin(secret: string): Promise<{ cookie: string; authorizationUrl: URL; state: OAuthState }> {
  const state = randomToken();
  const nonce = randomToken();
  const codeVerifier = randomToken(48);
  const flowState = { state, nonce, codeVerifier };
  return {
    cookie: await sealOAuthState(flowState, secret),
    authorizationUrl: new URL("https://accounts.google.com/o/oauth2/v2/auth"),
    state: flowState,
  };
}

export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
  expectedNonce: string,
  keySet: typeof GOOGLE_JWKS = GOOGLE_JWKS,
): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, keySet, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
    algorithms: ["RS256"],
  });
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (audiences.length > 1 && payload.azp !== clientId) throw new Error("Invalid authorized presenter");
  if (
    typeof payload.sub !== "string"
    || payload.sub.length > 255
    || !/^[\x21-\x7e]+$/.test(payload.sub)
    || typeof payload.email !== "string"
    || payload.email.length > 320
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)
    || payload.email_verified !== true
    || payload.nonce !== expectedNonce
  ) {
    throw new Error("Invalid Google identity claims");
  }
  return { subject: payload.sub, email: payload.email };
}
