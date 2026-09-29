import { describe, expect, it } from "vitest";
import { missingResponseSecurityHeaders } from "../../src/lib/response-security-headers.mjs";

const secureHeaders = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": "default-src 'self'; object-src 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

describe("cabeceras HTTP del origen publicado", () => {
  it("acepta el conjunto requerido de cabeceras", () => {
    expect(missingResponseSecurityHeaders(new Headers(secureHeaders))).toEqual([]);
  });

  it("detecta cabeceras ausentes y políticas débiles", () => {
    const headers = new Headers(secureHeaders);
    headers.delete("X-Frame-Options");
    headers.set("Content-Security-Policy", "default-src *; object-src 'none'");

    expect(missingResponseSecurityHeaders(headers)).toEqual([
      "Content-Security-Policy",
      "X-Frame-Options",
    ]);
  });
});
