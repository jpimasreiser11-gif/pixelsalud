# VARINO Autopilot: auditoría y fases verificables

Fecha de corte: 28-09-2026. Esta nota distingue el sitio estático, el trabajo
local y lo que todavía no existe en producción. No es una aprobación legal ni
de lanzamiento.

## Estado observado

- El sitio está construido con Astro 7 y genera salida `static` (38 páginas en
  el build local). El workflow de publicación de
  `.github/workflows/deploy.yml` despliega a GitHub Pages.
- No hay API de aplicación, autenticación, sesiones, base conectada, cola de
  jobs ni controles de tenant en runtime. Esta fase añade una migración D1 y
  configuración local; todavía no hay Pages Functions ni base remota enlazada.
- El backend de la web permanece desactivado (`BACKEND.enabled = false`). El
  formulario no confirma que se almacenen solicitudes; la guía publicada usa
  lógica local del navegador. El plugin Ollama existente solo corre en el
  servidor de desarrollo.
- La PR #14 añade un contrato allowlist para proponer planes. Por diseño,
  `executable: false`: no guarda datos, no conecta cuentas y no ejecuta n8n.
- En la auditoría, la PR #14 (apilada sobre otra rama) no tenía checks de GitHub:
  CI solo atendía PRs cuyo destino era `main`. Esta fase amplía el trigger a
  todas las PRs para que las ramas apiladas también reciban la verificación.
- n8n local respondió correctamente en `/healthz`. El último inventario del
  runbook privado registró 16 workflows inactivos, sin credenciales ni
  ejecuciones; ese inventario no se repitió en este bloque. No se demostró una
  automatización operativa de clientes.
- La identidad legal y las aprobaciones de lanzamiento siguen incompletas.
  `npm run launch:check` falla deliberadamente por marca, titular, NIF,
  domicilio y aprobaciones legal/seguridad ausentes.

## Pruebas repetidas

Verificación reejecutada en esta fase:

- `npm run test:unit`: 52/52.
- `npm run readiness`: build estático, SEO, scripts, enlaces, CSP y gate de
  publicación correctos (38 páginas).
- `npm run test:e2e`: 225 pasadas, 1 omitida, escritorio/móvil y pruebas de
  accesibilidad.
- `npm run test:d1`: migración local, aislamiento por workspace, unicidad de
  idempotencia e integridad de claves foráneas correctos.
- `npm audit --audit-level=moderate`: 0 vulnerabilidades.

La rama de base `audit/legal-and-growth-20260926` obtuvo además 39/39 unitarias
y 225 pasadas, 1 omitida. Estas pruebas locales no prueban publicación ni
integración SaaS.

## Deriva de producción: bloqueador prioritario

El smoke de solo lectura observó el SHA
`d824d2cc8afb1d3711c943b94daa66230053567d` y encontró 54 diferencias en 11
páginas. Entre ellas: referencias al túnel/webhooks anteriores, chat/analítica
cargados con backend desconectado, recursos sociales antiguos/404, sitemap
anunciado durante prelanzamiento, claims anteriores y ausencia de cabeceras HTTP
de seguridad en GitHub Pages. La PR #13 contiene la corrección de la deriva y
tenía un check de verificación verde al auditar; sigue abierta y sin publicar.

No fusionar ni desplegar para “arreglar” esto automáticamente: la rama actual
mantiene intencionalmente el gate de lanzamiento. Hay que revisar la PR, después
publicar solo con la aprobación correspondiente y repetir el smoke público.

## Planificador local ya existente

El nuevo `POST /api/autopilot/plan` es middleware **solo de `astro dev`**:

- llama al Ollama local; nunca acepta una URL de modelo del cliente;
- bloquea origen/IP no local, payloads inválidos y datos personales detectados;
- limita la longitud y la frecuencia, no registra el texto y no lo persiste;
- separa las reglas del sistema del texto no confiable del usuario;
- pide salida JSON guiada por el esquema Zod y valida de nuevo el contrato;
- devuelve siempre `persisted: false` y `executable: false`; no tiene tools ni
  llamadas a n8n, Google, Gmail o servicios externos.

No hay página pública, dashboard falso ni integración marcada como conectada.
Este tramo es una pieza local de planificación, no un SaaS ni un producto
disponible para clientes.

Verificación después de implementarlo: 52/52 pruebas unitarias, `npm run
readiness`, 225 pruebas E2E pasadas y 1 omitida, revisión de claims/cabeceras y
`npm audit --audit-level=moderate` sin vulnerabilidades. Una petición HTTP local
real a Astro dev invocó Qwen 3.8 vía Ollama y devolvió un plan de correo entrante
que pasó el contrato; la respuesta confirmó `executable: false` y
`persisted: false`. El build estático no contiene la ruta del API local ni la
dirección de Ollama. Ningún workflow n8n se activó.

## Nueva fase completada: núcleo D1 local

Se añadió `migrations/0001_autopilot_core.sql` con users, workspaces,
miembros/roles, sesiones que solo almacenan hash, automatizaciones,
versiones, aprobaciones, ejecuciones y auditoría. Las relaciones de escrituras
incluyen `workspace_id` en sus claves foráneas; las ejecuciones tienen una clave
de idempotencia única por workspace. El test usa exclusivamente un D1 temporal
local, comprueba que un miembro de otro workspace no pueda crear una
automatización y elimina su directorio temporal al terminar.

Esto es un esquema validado, no autenticación ni almacenamiento conectado a la
web. No se creó una base remota, no se guardaron leads y no hay endpoints que
permitan a un usuario leer o escribir esos datos. El estado detallado está en
[`autopilot-phase-1-d1-core.md`](./autopilot-phase-1-d1-core.md).

## Orden de construcción

1. Revisar la PR #13 y corregir la deriva pública. No desplegar hasta superar el
   gate legal y de seguridad.
2. Mantener el sitio público actual sin cambios de hosting. Cloudflare Pages
   Functions + D1 queda como runtime candidato para el SaaS y se ha probado
   localmente; GitHub Pages sirve archivos estáticos y no ejecuta la API.
3. Implementar autenticación real y autorización por workspace; probar login,
   revocación de sesión y accesos cruzados antes de conectar el esquema al API.
4. Añadir API autenticada para crear y versionar borradores, registro de
   auditoría y aprobaciones. No activar ejecución todavía.
5. Probar una integración de solo lectura con consentimiento OAuth en staging.
   No alojar workflows/credenciales de clientes en el n8n compartido hasta tener
   licencia de proveedor confirmada; su guía indica Enterprise o Embed para esos
   modelos de producto.
6. Solo después completar ejecución durable, recuperación, billing, analítica,
   exportación/borrado y controles de operación.

Cada fase debe tener pruebas locales, staging aislado y un gate separado de
publicación. Los mocks solo se permiten en tests; nunca se mostrarán como
integraciones reales.
