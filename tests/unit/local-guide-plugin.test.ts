import { describe, expect, it } from "vitest";
import { allowedOrigin, chooseModel, sanitizeMessages } from "../../src/lib/local-guide-plugin.mjs";

describe("protecciones del asistente local", () => {
  it("prefiere Qwen 3.8 cuando está instalado y respeta una preferencia explícita válida", () => {
    const installed = ["qwen3:14b", "llama3:8b", "qwen3.8:latest"];
    expect(chooseModel(installed)).toBe("qwen3.8:latest");
    expect(chooseModel(installed, "llama3:8b")).toBe("llama3:8b");
  });

  it("solo acepta el origen local en un host de bucle local y requiere Origin", () => {
    expect(allowedOrigin({ headers: { origin: "http://localhost:4321", host: "localhost:4321" } })).toBe(true);
    expect(allowedOrigin({ headers: { origin: "https://varinoai.me", host: "varinoai.me" } })).toBe(false);
    expect(allowedOrigin({ headers: { host: "localhost:4321" } })).toBe(false);
    expect(allowedOrigin({ headers: { origin: "http://localhost:4321", host: "192.168.1.10:4321" } })).toBe(false);
  });

  it("rechaza datos de contacto, identidad bancaria y secretos antes de procesar el historial", () => {
    expect(sanitizeMessages([{ role: "user", content: "Somos una clínica y perdemos citas" }])).toHaveLength(1);
    for (const content of [
      "Escríbeme a cliente@example.com",
      "Mi teléfono es +34 612 345 678",
      "Llamadme al 612 34 56 78",
      "DNI 12345678Z",
      "NIE X1234567L",
      "IBAN ES9121000418450200051332",
      "api_key=valor-secreto",
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
      "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz",
    ]) {
      expect(() => sanitizeMessages([{ role: "user", content }])).toThrow("personal_data_blocked");
    }
    expect(() => sanitizeMessages([
      { role: "assistant", content: "¿Qué proceso quieres mejorar?" },
      { role: "user", content: "mi correo es cliente@example.com" },
    ])).toThrow("personal_data_blocked");
  });
});
