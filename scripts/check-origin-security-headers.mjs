import { missingResponseSecurityHeaders } from "../src/lib/response-security-headers.mjs";

const originInput = process.env.VARINO_PUBLIC_ORIGIN ?? "https://varinoai.me";
let origin;

try {
  origin = new URL(originInput);
  if (origin.protocol !== "https:" || origin.username || origin.password) {
    throw new Error("origin must be HTTPS and contain no credentials");
  }
} catch (error) {
  console.error(`Origin header preflight: origin inválido (${error.message}).`);
  process.exit(2);
}

try {
  const response = await fetch(new URL("/", origin.origin), {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(12_000),
    headers: { accept: "text/html" },
  });
  if (response.status !== 200) {
    console.error(`Origin header preflight: GET / devolvió HTTP ${response.status}; no se prepara despliegue.`);
    process.exit(1);
  }
  if (!response.headers.get("content-type")?.includes("text/html")) {
    console.error("Origin header preflight: la ruta raíz no devuelve HTML; no se prepara despliegue.");
    process.exit(1);
  }
  const missing = missingResponseSecurityHeaders(response.headers);
  if (missing.length) {
    console.error(`Origin header preflight: faltan cabeceras HTTP en ${origin.origin}: ${missing.join(", ")}`);
    console.error("El despliegue queda bloqueado antes de publicar el artefacto.");
    process.exit(1);
  }
  console.log(`✓ origin header preflight en verde (${origin.origin})`);
} catch (error) {
  console.error(`Origin header preflight: no se pudo verificar el origen (${error.message}); despliegue bloqueado.`);
  process.exit(1);
}
