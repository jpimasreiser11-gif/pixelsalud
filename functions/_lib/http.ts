export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<Array<{ meta: { changes: number } }>>;
}

export type PagesFunction<Env> = (context: { request: Request; env: Env }) => Response | Promise<Response>;

export interface AuthEnvironment {
  VARINO_DB: D1Database;
  APP_BASE_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  OAUTH_STATE_SECRET?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface SessionRecord extends AuthenticatedUser {
  sessionId: string;
}

const SESSION_COOKIE = "varino_session";
const STATE_COOKIE = "varino_oauth_state";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
export const OAUTH_TTL_SECONDS = 60 * 10;

const encoder = new TextEncoder();

export function jsonResponse(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
  return new Response(JSON.stringify(body), { status, headers });
}

export function redirectResponse(location: string, status = 303, setCookies?: string | string[]): Response {
  const headers = new Headers({
    location,
    "cache-control": "private, no-store, max-age=0",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  });
  for (const cookie of setCookies ? (Array.isArray(setCookies) ? setCookies : [setCookies]) : []) {
    headers.append("set-cookie", cookie);
  }
  return new Response(null, { status, headers });
}

export function configuredBaseUrl(env: AuthEnvironment): URL | null {
  if (!env.APP_BASE_URL) return null;
  try {
    const base = new URL(env.APP_BASE_URL);
    const localHttp = base.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(base.hostname);
    if (base.username || base.password || base.search || base.hash || base.pathname !== "/") return null;
    if (base.protocol !== "https:" && !localHttp) return null;
    return base;
  } catch {
    return null;
  }
}

export function isAuthConfigured(env: AuthEnvironment): boolean {
  return Boolean(
    configuredBaseUrl(env)
    && env.GOOGLE_CLIENT_ID?.trim()
    && env.GOOGLE_CLIENT_SECRET?.trim()
    && env.OAUTH_STATE_SECRET
    && encoder.encode(env.OAUTH_STATE_SECRET).byteLength >= 32,
  );
}

export function requestHasExpectedOrigin(request: Request, env: AuthEnvironment): boolean {
  const base = configuredBaseUrl(env);
  if (!base || new URL(request.url).origin !== base.origin) return false;
  return request.headers.get("origin") === base.origin;
}

function cookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader || cookieHeader.length > 8192) return null;
  const matches = cookieHeader.split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  return matches[0].slice(name.length + 1) || null;
}

function cookieSecurity(baseUrl: URL): string {
  return baseUrl.protocol === "https:" ? "; Secure" : "";
}

export function setSessionCookie(token: string, baseUrl: URL): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${cookieSecurity(baseUrl)}`;
}

export function clearSessionCookie(baseUrl: URL): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieSecurity(baseUrl)}`;
}

export function setStateCookie(token: string, baseUrl: URL): string {
  return `${STATE_COOKIE}=${token}; Path=/api/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=${OAUTH_TTL_SECONDS}${cookieSecurity(baseUrl)}`;
}

export function clearStateCookie(baseUrl: URL): string {
  return `${STATE_COOKIE}=; Path=/api/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=0${cookieSecurity(baseUrl)}`;
}

export function randomToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function findSession(request: Request, db: D1Database, now = Math.floor(Date.now() / 1000)): Promise<SessionRecord | null> {
  const base64Token = cookieValue(request, SESSION_COOKIE);
  if (!base64Token || !/^[A-Za-z0-9_-]{40,60}$/.test(base64Token)) return null;
  const tokenHash = await sha256Hex(base64Token);
  return db.prepare(`
    SELECT u.id, u.email, s.id AS sessionId
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > ?
      AND u.status = 'active'
    LIMIT 1
  `).bind(tokenHash, now).first<SessionRecord>();
}

export function oauthCallbackUrl(baseUrl: URL): string {
  return new URL("/api/auth/google/callback", baseUrl).toString();
}
