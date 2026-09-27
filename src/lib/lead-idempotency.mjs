const NONCE_RE = /^[0-9a-f]{32}$/i;
const memoryNonces = new Map();

function storageKey(scope) {
  const safeScope = /^[a-z0-9-]{1,40}$/i.test(scope) ? scope : "general";
  return `varino:lead:${safeScope}:v1`;
}

function createNonce(cryptoApi) {
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") return "";
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function getLeadSubmissionId(scope, payload, dependencies = {}) {
  let storage;
  let cryptoApi;
  if (Object.prototype.hasOwnProperty.call(dependencies, "storage")) {
    storage = dependencies.storage;
  } else {
    try { storage = globalThis.sessionStorage; } catch { /* restricted browser context */ }
  }
  if (Object.prototype.hasOwnProperty.call(dependencies, "cryptoApi")) {
    cryptoApi = dependencies.cryptoApi;
  } else {
    try { cryptoApi = globalThis.crypto; } catch { /* restricted browser context */ }
  }

  const key = storageKey(scope);
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function"
    || !cryptoApi.subtle || typeof cryptoApi.subtle.digest !== "function") return "";

  let nonce = "";
  try {
    const existing = storage && storage.getItem(key);
    if (typeof existing === "string" && NONCE_RE.test(existing)) nonce = existing;
  } catch { /* storage is optional; keep this identifier in memory for this attempt */ }
  if (!nonce) nonce = memoryNonces.get(key) || "";
  if (!nonce) nonce = createNonce(cryptoApi);
  if (!nonce) return "";

  memoryNonces.set(key, nonce);
  try { storage && storage.setItem(key, nonce); } catch { /* a page reload may require a fresh key */ }
  try {
    const canonicalPayload = JSON.stringify(payload);
    if (typeof canonicalPayload !== "string") return "";
    const bytes = new TextEncoder().encode(`${nonce}:${canonicalPayload}`);
    const digest = await cryptoApi.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

export function clearLeadSubmissionId(scope, dependencies = {}) {
  let storage = dependencies.storage;
  if (!storage) {
    try { storage = globalThis.sessionStorage; } catch { /* restricted browser context */ }
  }
  const key = storageKey(scope);
  memoryNonces.delete(key);
  try { storage && storage.removeItem(key); } catch { /* storage is optional */ }
}
