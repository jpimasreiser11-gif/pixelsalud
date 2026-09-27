import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { clearLeadSubmissionId, getLeadSubmissionId } from "../../src/lib/lead-idempotency.mjs";

function createStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
  };
}

describe("identificadores de reintento de leads", () => {
  it("conserva la misma clave solo si el contenido del formulario no cambia", async () => {
    const storage = createStorage();
    const cryptoApi = webcrypto as unknown as Crypto;
    const payload = { email: "persona@example.com", mensaje: "proceso de citas" };
    const first = await getLeadSubmissionId("contacto", payload, { storage, cryptoApi });
    const retry = await getLeadSubmissionId("contacto", payload, { storage, cryptoApi });
    const edited = await getLeadSubmissionId("contacto", { ...payload, mensaje: "otro proceso" }, { storage, cryptoApi });
    expect(first).toMatch(/^[0-9a-f]{64}$/i);
    expect(retry).toBe(first);
    expect(edited).not.toBe(first);
  });

  it("aísla formularios distintos y rota la clave tras un envío confirmado", async () => {
    const storage = createStorage();
    const cryptoApi = webcrypto as unknown as Crypto;
    const payload = { email: "persona@example.com" };
    const contactId = await getLeadSubmissionId("contacto", payload, { storage, cryptoApi });
    const auditId = await getLeadSubmissionId("auditoria", payload, { storage, cryptoApi });
    expect(auditId).not.toBe(contactId);
    clearLeadSubmissionId("contacto", { storage });
    expect(await getLeadSubmissionId("contacto", payload, { storage, cryptoApi })).not.toBe(contactId);
  });

  it("no recurre a un identificador predecible si Web Crypto no está disponible", async () => {
    expect(await getLeadSubmissionId("contacto", {}, { storage: createStorage(), cryptoApi: null })).toBe("");
  });
});
