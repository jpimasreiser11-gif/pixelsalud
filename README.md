# VARINO AI

Agencia de automatización e inteligencia artificial para procesos de empresa.
Este repositorio contiene el sitio público estático y una base de producto para
VARINO Autopilot; las funciones locales y los conectores no se consideran
integraciones de producción.

- Web: Astro 7 + Tailwind 4; la salida actual es estática y se publica en
  GitHub Pages. El planificador de Qwen solo corre en `astro dev`.
- `npm run readiness`: build, SEO, sintaxis, enlaces, CSP y gate de publicación.
- `npm run test:unit` y `npm run test:e2e`: lógica, navegador, accesibilidad y
  revisión del HTML estático.
- Playwright no reutiliza servidores por defecto para evitar probar otro
  checkout. Si el puerto 4321 está ocupado, elige puertos libres:
  `PLAYWRIGHT_DEV_URL=http://localhost:4324 PLAYWRIGHT_PUBLISHED_URL=http://localhost:4457 npm run test:e2e`.
- `ops/`: operación interna; no se publica. La configuración de marca y
  contacto está en `src/config.ts`.

Dominio principal: https://varinoai.me
