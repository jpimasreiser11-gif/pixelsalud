# VARINO Autopilot: auditoría y fases verificables

Fecha de corte: 28-09-2026. Esta nota distingue el sitio estático, el trabajo
local y lo que todavía no existe en producción. No es una aprobación legal ni
de lanzamiento.

## Estado observado

- El sitio está construido con Astro 7 y genera salida `static` (38 páginas en
  el build local). El workflow de publicación de
  `.github/workflows/deploy.yml` despliega a GitHub Pages.
- No hay rutas API de aplicación, autenticación, sesiones, base de datos,
  migraciones, cola de jobs ni aislamiento por workspace. `wrangler` aparece
  como herramienta local, pero no hay configuración D1/Functions en la rama.
- El backend de la web permanece desactivado (`BACKEND.enabled = false`). El
  formulario no confirma que se almacenen solicitudes; la guía publicada usa
  lógica local del navegador. El plugin Ollama existente solo corre en el
  servidor de desarrollo.
- La PR #14 añade un contrato allowlist para proponer planes. Por diseño,
  `executable: false`: no guarda datos, no conecta cuentas y no ejecuta n8n.
- En la auditoría, la PR #14 (apilada sobre otra rama) no tenía checks de GitHub:
  CI solo atendía PRs cuyo destino era `main`. Esta fase amplía el trigger a
  todas las PRs para que las ramas apiladas también reciban la verificación.
- n8n local responde, pero la revisión de su base encontró 17 workflows, 0
  activos, 0 credenciales y 0 ejecuciones. La consola continúa en configuración
  inicial; no se demostró ninguna automatización de clientes.
- La identidad legal y las aprobaciones de lanzamiento siguen incompletas.
  `npm run launch:check` falla deliberadamente por marca, titular, NIF,
  domicilio y aprobaciones legal/seguridad ausentes.

## Pruebas repetidas

En la base de la PR #14, antes de los cambios del planificador:

- `npm run test:unit`: 45/45.
- `npm run readiness`: build estático, SEO, scripts, enlaces, CSP y gate de
  publicación correctos.
- `npm run test:e2e`: 225 pasadas, 1 omitida, escritorio/móvil y pruebas de
  accesibilidad.

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

## Tramo implementado en esta fase

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

## Orden de construcción

1. Cerrar y verificar la deriva pública de la PR #13 sin saltarse el gate legal.
2. Elegir el runtime dinámico y comprobar la cuenta/hosting; GitHub Pages por sí
   solo no puede alojar la API y los jobs del SaaS. La propuesta previa menciona
   Cloudflare Pages Functions + D1, pero no está configurada ni desplegada.
3. Añadir autenticación gestionada, workspaces y migraciones con pruebas de
   acceso cruzado antes de guardar planes de usuarios.
4. Persistir drafts versionados y auditoría; crear aprobaciones y límites de
   coste antes de cualquier escritura externa.
5. Probar una sola integración de solo lectura en staging con autorización
   OAuth explícita; mantener n8n y las credenciales bajo control del cliente o
   confirmar por escrito la licencia aplicable antes de ofrecer hosting
   compartido.
6. Solo después completar ejecución durable, recuperación, billing, analítica,
   exportación/borrado y controles de operación.

Cada fase debe tener pruebas locales, staging aislado y un gate separado de
publicación. Los mocks solo se permiten en tests; nunca se mostrarán como
integraciones reales.
