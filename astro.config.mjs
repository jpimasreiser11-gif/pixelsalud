import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { createLocalGuidePlugin } from "./src/lib/local-guide-plugin.mjs";

// Una sola fuente para la política de contenido. Se usa en tres sitios:
//  1. Las cabeceras de los servidores de desarrollo y de preview (abajo).
//  2. El <meta http-equiv="content-security-policy"> que Astro escribe en cada
//     página del build, con los hashes de sus propios scripts y estilos.
//  3. public/_headers, para el día que se sirva desde un host que respete
//     cabeceras (Cloudflare Pages, Netlify). GitHub Pages las ignora, así que
//     hoy el <meta> es la única CSP que llega al navegador del visitante.
// El gate `npm run csp:check` comprueba que las tres versiones no divergan.
export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self' mailto:",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
];

// frame-ancestors no existe en <meta>: solo funciona como cabecera. Se queda
// fuera de CSP_DIRECTIVES para que Astro no la emita y la avise por consola.
const CSP_HEADER = [
  ...CSP_DIRECTIVES,
  "frame-ancestors 'none'",
  "style-src 'self'",
  "script-src 'self'",
].join("; ");

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy": CSP_HEADER,
};

export const DEPLOY_BASE = "/pixelsalud";

// Añadir site e integración de sitemap solo cuando exista un dominio verificado.
export default defineConfig({
  site: "https://jpimasreiser11-gif.github.io",
  base: process.env.GITHUB_ACTIONS === "true" ? DEPLOY_BASE : "/",
  security: { csp: { directives: CSP_DIRECTIVES } },
  vite: {
    plugins: [tailwindcss(), createLocalGuidePlugin()],
    // Sin esto, Astro incrusta los scripts pequeños dentro del HTML. La CSP no
    // admite scripts en línea, así que el tema, el menú móvil y el formulario
    // de contacto quedaban muertos en la web publicada aunque funcionaran en
    // desarrollo. Con el límite en 0, cada script sale como archivo propio.
    build: { assetsInlineLimit: 0 },
    server: { headers: securityHeaders },
    preview: { headers: securityHeaders },
  },
});
