import { readFile } from "node:fs/promises";
import { siteCspHeader } from '../src/lib/content-security-policy.mjs';

const file = new URL("../public/_headers", import.meta.url);
const source = await readFile(file, "utf8");
const required = [
  ["X-Content-Type-Options", /X-Content-Type-Options:\s*nosniff/i],
  ["Referrer-Policy", /Referrer-Policy:\s*strict-origin-when-cross-origin/i],
  ["X-Frame-Options", /X-Frame-Options:\s*DENY/i],
  ["Permissions-Policy", /Permissions-Policy:\s*camera=\(\), microphone=\(\), geolocation=\(\)/i],
  ["Cross-Origin-Opener-Policy", /Cross-Origin-Opener-Policy:\s*same-origin/i],
  ["HSTS", /Strict-Transport-Security:\s*max-age=31536000; includeSubDomains/i],
  ["CSP default", /default-src 'self'/i],
  ["CSP base", /base-uri 'self'/i],
  ["CSP objects", /object-src 'none'/i],
  ["CSP frames", /frame-ancestors 'none'/i],
  ["CSP connections", /connect-src 'self'/i],
];

const failures = required.filter(([, pattern]) => !pattern.test(source)).map(([name]) => name);
if (/script-src[^;\n]*'unsafe-inline'/i.test(source)) failures.push("CSP permits inline executable scripts");
const csp = source.match(/Content-Security-Policy:\s*([^\n]+)/i)?.[1] || "";
if (/(^|\s)\*(\s|;|$)/.test(csp)) failures.push("Wildcard found in CSP");
if (csp !== siteCspHeader(false)) failures.push('Source CSP template diverges from prelaunch policy');
const built = await readFile(new URL('../dist/_headers', import.meta.url), 'utf8').catch(() => '');
if (!built || built.match(/Content-Security-Policy:\s*([^\n]+)/i)?.[1] !== siteCspHeader()) failures.push('Build CSP missing or diverges from shared policy');
if (failures.length) {
  console.error(`Security header check failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("✓ configuración de cabeceras en public/_headers correcta (configuración local; no demuestra entrega del hosting)");
