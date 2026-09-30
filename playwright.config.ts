import { defineConfig, devices } from "@playwright/test";

function getPort(name: string, fallback: number): number {
  const configured = process.env[name];
  if (!configured) return fallback;
  const port = Number(configured);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`${name} must be an integer between 1024 and 65535`);
  }
  return port;
}

const DEV_PORT = getPort("VARINO_E2E_PORT", 4321);
const PUBLISHED_PORT = getPort("VARINO_E2E_PUBLISHED_PORT", 4456);
const DEV_URL = `http://localhost:${DEV_PORT}`;
// Puerto propio para el build estático: no puede compartirlo con el servidor de
// desarrollo porque las dos pruebas corren a la vez. Los puertos se pueden
// aislar por proceso para no reutilizar accidentalmente otra preview local.
const PUBLISHED_URL = `http://localhost:${PUBLISHED_PORT}/`;

export default defineConfig({
  testDir: "tests",
  use: {
    // "localhost" resuelve IPv6 e IPv4. Fijar 127.0.0.1 rompía la suite
    // porque el servidor de Astro escucha en [::1] cuando no se pasa --host.
    baseURL: DEV_URL,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `npm run dev -- --port ${DEV_PORT} --strictPort`,
      // Comprobar la URL real, no solo el puerto: así detecta el servidor
      // existente exactamente por donde luego navegan las pruebas.
      url: `${DEV_URL}/`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // El artefacto publicado, servido como lo sirve GitHub Pages: sin
      // cabeceras de seguridad. `astro preview` sí las manda, y eso escondía
      // que en producción la única CSP es el <meta> del HTML.
      command: `GITHUB_ACTIONS=true npm run build && node scripts/serve-dist.mjs --port ${PUBLISHED_PORT}`,
      url: PUBLISHED_URL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: "chromium", testDir: "tests/e2e", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      testDir: "tests/e2e",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
    {
      // Las mismas garantías, pero contra el HTML que se sube a producción.
      name: "publicada",
      testDir: "tests/published",
      use: { ...devices["Desktop Chrome"], baseURL: PUBLISHED_URL },
    },
    {
      name: "publicada-movil",
      testDir: "tests/published",
      use: { ...devices["iPhone 13"], browserName: "chromium", baseURL: PUBLISHED_URL },
    },
  ],
});
