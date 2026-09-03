import { defineConfig, devices } from "@playwright/test";

const DEV_URL = "http://localhost:4321";
// Puerto propio para el build estático: no puede compartirlo con el servidor de
// desarrollo porque las dos pruebas corren a la vez.
const PUBLISHED_URL = "http://localhost:4456/pixelsalud/";

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
      command: "npm run dev",
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
      command: "GITHUB_ACTIONS=true npm run build && node scripts/serve-dist.mjs --port 4456 --base /pixelsalud",
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
