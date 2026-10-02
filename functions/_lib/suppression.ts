import { launchReady } from '../../src/lib/launch-config.mjs';
import { Recipient } from '../../src/lib/unsubscribe-contract.mjs';
import { configuredBaseUrl, jsonResponse, type AuthEnvironment } from './http';
import { authorizeWorker } from './document-jobs';

export interface SuppressionEnvironment extends AuthEnvironment {
  AGENCY_WORKSPACE_ID?: string;
  UNSUBSCRIBE_MODE?: string;
  UNSUBSCRIBE_ISSUANCE_ENABLED?: string;
  UNSUBSCRIBE_ISSUER_TOKEN_HASH?: string;
  UNSUBSCRIBE_SYNC_TOKEN_HASH?: string;
  SUPPRESSION_CHECK_TOKEN_HASH?: string;
  SUPPRESSION_PRIVACY_KEY?: string;
}
export function localSuppressionTest(env: SuppressionEnvironment): boolean {
  const base = configuredBaseUrl(env);
  return env.UNSUBSCRIBE_MODE === 'local-test' && base?.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
}
export function suppressionConfigured(env: SuppressionEnvironment): boolean {
  const base = configuredBaseUrl(env);
  const hashes = [env.UNSUBSCRIBE_ISSUER_TOKEN_HASH, env.UNSUBSCRIBE_SYNC_TOKEN_HASH, env.SUPPRESSION_CHECK_TOKEN_HASH];
  return Boolean(env.VARINO_DB && base && /^[a-zA-Z0-9_-]{1,80}$/.test(env.AGENCY_WORKSPACE_ID ?? '')
    && /^[A-Za-z0-9_-]{43}$/.test(env.SUPPRESSION_PRIVACY_KEY ?? '')
    && hashes.every((hash) => /^[a-f0-9]{64}$/.test(hash ?? '')) && new Set(hashes).size === 3
    && (localSuppressionTest(env) || (env.UNSUBSCRIBE_MODE === 'production' && base.protocol === 'https:')));
}
export function issuanceConfigured(env: SuppressionEnvironment): boolean {
  return suppressionConfigured(env) && env.UNSUBSCRIBE_ISSUANCE_ENABLED === '1' && (localSuppressionTest(env) || launchReady);
}
export function authorizeSuppressionWorker(request: Request, env: SuppressionEnvironment, scope: 'issue' | 'sync' | 'check') {
  if (!suppressionConfigured(env)) return Promise.resolve(jsonResponse({ error: 'suppression_unavailable' }, 503));
  const hash = scope === 'issue' ? env.UNSUBSCRIBE_ISSUER_TOKEN_HASH
    : scope === 'sync' ? env.UNSUBSCRIBE_SYNC_TOKEN_HASH : env.SUPPRESSION_CHECK_TOKEN_HASH;
  return authorizeWorker(request, { ...env, DOCUMENT_WORKER_TOKEN_HASH: hash });
}
const encoder = new TextEncoder();
function encode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function decode(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function privacyKey(env: SuppressionEnvironment, kind: 'recipient' | 'email') {
  const raw = decode(env.SUPPRESSION_PRIVACY_KEY!);
  if (raw.byteLength !== 32) throw new Error('privacy_key_invalid');
  const material = await crypto.subtle.importKey('raw', raw as BufferSource, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({
    name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('VARINO suppression v1'),
    info: encoder.encode(kind + ':' + env.AGENCY_WORKSPACE_ID),
  }, material, kind === 'recipient' ? { name: 'HMAC', hash: 'SHA-256', length: 256 } : { name: 'AES-GCM', length: 256 },
  false, kind === 'recipient' ? ['sign'] : ['encrypt', 'decrypt']);
}
export async function recipientKey(email: string, env: SuppressionEnvironment): Promise<string> {
  const digest = await crypto.subtle.sign('HMAC', await privacyKey(env, 'recipient'), encoder.encode(Recipient.parse(email)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function encryptRecipient(email: string, key: string, env: SuppressionEnvironment): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({
    name: 'AES-GCM', iv, additionalData: encoder.encode(env.AGENCY_WORKSPACE_ID + ':' + key),
  }, await privacyKey(env, 'email'), encoder.encode(Recipient.parse(email)));
  return encode(iv) + '.' + encode(new Uint8Array(data));
}
export async function decryptRecipient(ciphertext: string, key: string, env: SuppressionEnvironment): Promise<string> {
  const parts = ciphertext.split('.');
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) throw new Error('ciphertext_invalid');
  const iv = decode(parts[0]);
  if (iv.byteLength !== 12) throw new Error('ciphertext_invalid');
  const data = await crypto.subtle.decrypt({
    name: 'AES-GCM', iv: iv as BufferSource, additionalData: encoder.encode(env.AGENCY_WORKSPACE_ID + ':' + key),
  }, await privacyKey(env, 'email'), decode(parts[1]) as BufferSource);
  const email = Recipient.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
  if (await recipientKey(email, env) !== key) throw new Error('recipient_mismatch');
  return email;
}
export async function maintainSuppression(env: SuppressionEnvironment, now: number) {
  await env.VARINO_DB.batch([
    env.VARINO_DB.prepare('DELETE FROM unsubscribe_tokens WHERE workspace_id=? AND expires_at<=?')
      .bind(env.AGENCY_WORKSPACE_ID, now),
    env.VARINO_DB.prepare("UPDATE suppression_outbox SET status='manual_review',error_code='lease_expired',lease_expires_at=NULL,updated_at=? WHERE workspace_id=? AND status='claimed' AND lease_expires_at<=?")
      .bind(now, env.AGENCY_WORKSPACE_ID, now),
    env.VARINO_DB.prepare("UPDATE suppression_outbox SET encrypted_email=NULL,status='expired',error_code='payload_expired',lease_expires_at=NULL,updated_at=? WHERE workspace_id=? AND payload_expires_at<=? AND encrypted_email IS NOT NULL")
      .bind(now, env.AGENCY_WORKSPACE_ID, now),
  ]);
  // Never expire/delete the opposition ledger as a side effect of a queue timeout.
}
