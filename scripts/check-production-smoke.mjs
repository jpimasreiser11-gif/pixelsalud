import { launchReady } from "../src/lib/launch-config.mjs";
import { missingResponseSecurityHeaders } from "../src/lib/response-security-headers.mjs";

const originInput = process.env.VARINO_PUBLIC_ORIGIN ?? "https://varinoai.me";
let origin;

try {
  origin = new URL(originInput);
  if (!["https:", "http:"].includes(origin.protocol) || origin.username || origin.password) {
    throw new Error("origin must be an HTTP(S) URL without credentials");
  }
  if (origin.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) {
    throw new Error("plain HTTP is allowed only for a local smoke-test server");
  }
} catch (error) {
  console.error(`Production smoke: origin inválido (${error.message}).`);
  process.exit(2);
}

const base = origin.origin;
const routes = [
  "/",
  "/servicios/",
  "/servicios/automation-sprint/",
  "/precios/",
  "/planes/",
  "/contacto/",
  "/reservar/",
  "/aviso-legal/",
  "/privacidad/",
  "/cookies/",
  "/dpa/",
];
const errors = [];
const htmlByRoute = new Map();
const missingHeaders = new Map();

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tag?.match(new RegExp(`\\b${escaped}="([^"]*)"`, "i"))?.[1] ?? "";
}

function meta(html, key, value) {
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  return tags.find((tag) => attribute(tag, key) === value);
}

async function get(path) {
  const response = await fetch(new URL(path, base), {
    redirect: "manual",
    signal: AbortSignal.timeout(12_000),
    headers: { accept: "text/html, text/plain, application/xml, image/png, image/jpeg, */*" },
  });
  if (response.status >= 300 && response.status < 400) errors.push(`${path}: respuesta redirigida; inspecciona el destino antes de seguirla`);
  return response;
}

for (const route of routes) {
  try {
    const response = await get(route);
    const html = await response.text();
    if (response.status !== 200) {
      errors.push(`${route}: HTTP ${response.status}`);
      continue;
    }
    if (!response.headers.get("content-type")?.includes("text/html")) {
      errors.push(`${route}: la respuesta no es HTML`);
      continue;
    }
    htmlByRoute.set(route, html);

    // Verify what the public HTTPS origin actually delivers, not only the
    // hosting-specific config file. A meta CSP is checked below, but cannot
    // replace CSP frame-ancestors or transport/security response headers.
    if (origin.protocol === "https:") {
      for (const name of missingResponseSecurityHeaders(response.headers)) {
        const routesMissing = missingHeaders.get(name) ?? [];
        routesMissing.push(route);
        missingHeaders.set(name, routesMissing);
      }
    }

    const canonicalTag = [...html.matchAll(/<link\b[^>]*>/gi)]
      .map((match) => match[0])
      .find((tag) => attribute(tag, "rel") === "canonical");
    const canonical = attribute(canonicalTag, "href");
    const expectedCanonical = new URL(route, "https://varinoai.me").href;
    if (canonical !== expectedCanonical) errors.push(`${route}: canonical esperado ${expectedCanonical}`);

    const ogImage = attribute(meta(html, "property", "og:image"), "content");
    const expectedOgImage = "https://varinoai.me/og/varino-social.png";
    if (ogImage !== expectedOgImage) errors.push(`${route}: imagen social Open Graph ausente o distinta`);

    const csp = attribute(meta(html, "http-equiv", "content-security-policy"), "content");
    if (!csp.includes("default-src 'self'") || !csp.includes("object-src 'none'")) {
      errors.push(`${route}: CSP HTML ausente o incompleta`);
    }
    if (/\bunsafe-(?:inline|eval)\b/i.test(csp)) errors.push(`${route}: CSP permite unsafe-inline/eval`);

    const endpointAttributes = [...html.matchAll(/\b(?:data-[\w-]+|src|href|action)="([^"]*)"/gi)]
      .map((match) => match[1]);
    if (endpointAttributes.some((value) => /ngrok(?:-free)?\.(?:dev|io)|(?:^|\/)webhook(?:\/|$)|https?:\/\/(?:localhost|127\.0\.0\.1):11434/i.test(value))) {
      errors.push(`${route}: contiene una URL de túnel, webhook directo o endpoint Ollama local`);
    }
    if (!launchReady) {
      const robots = attribute(meta(html, "name", "robots"), "content").toLowerCase();
      if (!robots.includes("noindex")) errors.push(`${route}: debe seguir en noindex hasta aprobar el lanzamiento`);
      const tags = [...html.matchAll(/<[a-z][^>]*>/gi)].map((match) => match[0]);
      if (tags.some((tag) => /\bdata-aichat\b/i.test(tag) && /\bdata-enabled="true"/i.test(tag)) || tags.some((tag) => /\bdata-analytics\b/i.test(tag))) {
        errors.push(`${route}: carga chat/analítica mientras el backend está deshabilitado`);
      }
    }
  } catch (error) {
    errors.push(`${route}: ${error.message}`);
  }
}

for (const [name, routesMissing] of missingHeaders) {
  errors.push(`cabecera HTTP ${name} ausente o débil en ${routesMissing.length}/${routes.length} páginas HTML`);
}

const home = htmlByRoute.get("/") ?? "";
const obsoleteClaims = [
  /Algoritmo de ROI Auditado/i,
  /ROI\s*1\s*[.,]?\s*140\s*%/i,
  /23\.552\s*€/i,
  /29\s*d[ií]as/i,
  /despliegue en 7 d[ií]as/i,
  /0\s*€ en costes ocultos/i,
  /datos\s*100\s*% privados bajo RGPD/i,
];
if (obsoleteClaims.some((claim) => claim.test(home))) {
  errors.push("/: conserva afirmaciones antiguas de ROI, ahorro, plazo, licencias o privacidad no verificadas");
}

try {
  const versionResponse = await get("/version.txt");
  const deployedVersion = (await versionResponse.text()).trim();
  if (versionResponse.status !== 200 || !/^[a-f0-9]{40}$/i.test(deployedVersion)) {
    errors.push("/version.txt: falta el SHA de 40 caracteres estampado por el despliegue");
  } else {
    console.log(`Versión observada en producción: ${deployedVersion}`);
    const expectedVersion = process.env.VARINO_EXPECTED_VERSION?.trim();
    if (expectedVersion && deployedVersion.toLowerCase() !== expectedVersion.toLowerCase()) {
      errors.push(`/version.txt: producción sirve ${deployedVersion}, se esperaba ${expectedVersion}`);
    }
  }
} catch (error) {
  errors.push(`/version.txt: ${error.message}`);
}

try {
  const robotsResponse = await get("/robots.txt");
  const robotsText = await robotsResponse.text();
  if (robotsResponse.status !== 200) errors.push(`/robots.txt: HTTP ${robotsResponse.status}`);
  if (!launchReady && /^Sitemap:/mi.test(robotsText)) errors.push("/robots.txt: anuncia sitemap antes de aprobar el lanzamiento");
  if (launchReady && !/Sitemap:\s*https:\/\/varinoai\.me\/sitemap-index\.xml/i.test(robotsText)) {
    errors.push("/robots.txt: no anuncia el sitemap canónico después de aprobar el lanzamiento");
  }
} catch (error) {
  errors.push(`/robots.txt: ${error.message}`);
}

try {
  const sitemapResponse = await get("/sitemap-index.xml");
  if (!launchReady && sitemapResponse.status !== 404) errors.push("/sitemap-index.xml: debe permanecer ausente antes del lanzamiento");
  if (launchReady && sitemapResponse.status !== 200) errors.push(`/sitemap-index.xml: HTTP ${sitemapResponse.status}`);
} catch (error) {
  errors.push(`/sitemap-index.xml: ${error.message}`);
}

const imageResponse = await get("/og/varino-social.png").catch((error) => {
  errors.push(`/og/varino-social.png: ${error.message}`);
  return null;
});
if (imageResponse && (imageResponse.status !== 200 || !imageResponse.headers.get("content-type")?.startsWith("image/"))) {
  errors.push(`/og/varino-social.png: imagen no servida correctamente (HTTP ${imageResponse.status})`);
}

if (errors.length) {
  console.error(`Production smoke: ${errors.length} problema(s) en ${routes.length} páginas (${launchReady ? "publicación aprobada" : "prelanzamiento noindex"}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Production smoke OK: ${routes.length} páginas, origen, versión, cabeceras HTTP, CSP, contenido, indexación y recursos comprobados.`);
}
