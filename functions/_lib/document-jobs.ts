import { configuredBaseUrl, findSession, jsonResponse, sha256Hex, type AuthEnvironment } from './http';

export interface DocumentEnvironment extends AuthEnvironment {
  AGENCY_WORKSPACE_ID?: string;
  DOCUMENT_WORKER_TOKEN_HASH?: string;
}
export function documentJobsConfigured(env: DocumentEnvironment): boolean {
  return Boolean(configuredBaseUrl(env) && /^[a-zA-Z0-9_-]{1,80}$/.test(env.AGENCY_WORKSPACE_ID ?? '')
    && /^[a-f0-9]{64}$/.test(env.DOCUMENT_WORKER_TOKEN_HASH ?? ''));
}
export function equalHash(a: string, b: string): boolean {
  if (a.length !== 64 || b.length !== 64) return false;
  let difference = 0;
  for (let i = 0; i < 64; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
export async function authorizeWorker(request: Request, env: DocumentEnvironment): Promise<Response | null> {
  if (!documentJobsConfigured(env) || new URL(request.url).origin !== configuredBaseUrl(env)?.origin) return jsonResponse({ error: 'worker_unavailable' }, 503);
  // Worker calls are server-to-server. Browser origins and session cookies cannot authorize jobs.
  const authorization = request.headers.get('authorization') ?? '';
  if (request.headers.has('origin') || !/^Bearer [A-Za-z0-9_-]{43,128}$/.test(authorization)) return jsonResponse({ error: 'unauthorized' }, 401);
  const actual = await sha256Hex(authorization.slice(7));
  return equalHash(actual, env.DOCUMENT_WORKER_TOKEN_HASH!) ? null : jsonResponse({ error: 'unauthorized' }, 401);
}
export async function authorizeAgencyOwner(request: Request, env: DocumentEnvironment): Promise<{ userId: string } | Response> {
  if (!env.VARINO_DB) return jsonResponse({ error: 'service_unavailable' }, 503);
  const session = await findSession(request, env.VARINO_DB);
  if (!session) return jsonResponse({ error: 'unauthorized' }, 401);
  if (!documentJobsConfigured(env)) return jsonResponse({ error: 'document_jobs_unavailable' }, 503);
  const owner = await env.VARINO_DB.prepare(`SELECT wm.user_id FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.workspace_id = ? AND wm.user_id = ? AND wm.status = 'active'
      AND wm.role = 'OWNER' AND w.status = 'active' LIMIT 1`)
    .bind(env.AGENCY_WORKSPACE_ID, session.id).first();
  return owner ? { userId: session.id } : jsonResponse({ error: 'agency_owner_required' }, 403);
}
export async function readBoundedJson(request: Pick<Request, 'body'>, limit = 8192): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_json');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error('body_too_large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export function bodyError(error: unknown): Response {
  const tooLarge = error instanceof Error && error.message === 'body_too_large';
  return jsonResponse({ error: tooLarge ? 'body_too_large' : 'invalid_request' }, tooLarge ? 413 : 400);
}
export function isJsonRequest(request: Request): boolean {
  return request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/json';
}
