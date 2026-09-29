import { defineConfig, devices } from "@playwright/test";

const DEV_URL = process.env.PLAYWRIGHT_DEV_URL || "http://localhost:4321";
const DEV_HOST = new URL(DEV_URL).hostname;
const DEV_PORT = new URL(DEV_URL).port || "4321";
// Puerto propio para el build estático: no puede compartirlo con el servidor de
// desarrollo porque las dos pruebas corren a la vez.
const PUBLISHED_URL = process.env.PLAYWRIGHT_PUBLISHED_URL || "http://localhost:4456/";
const PUBLISHED_PORT = new URL(PUBLISHED_URL).port || "80";

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
      command: `ASTRO_DEV_BACKGROUND=false npx astro dev --host ${DEV_HOST} --port ${DEV_PORT} --ignore-lock`,
      // Comprobar la URL real, no solo el puerto, antes de ejecutar pruebas.
      url: `${DEV_URL}/`,
      // No reutilizar servidores de otro checkout: pueden servir una build
      // antigua y producir fallos engañosos o falsos verdes. La reutilización
      // solo se habilita expresamente para el mismo checkout.
      reuseExistingServer: process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "true",
      timeout: 60_000,
    },
    {
      // El artefacto publicado, servido como lo sirve GitHub Pages: sin
      // cabeceras de seguridad. `astro preview` sí las manda, y eso escondía
      // que en producción la única CSP es el <meta> del HTML.
      command: `GITHUB_ACTIONS=true npm run build && node scripts/serve-dist.mjs --port ${PUBLISHED_PORT}`,
      url: PUBLISHED_URL,
      reuseExistingServer: process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "true",
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
