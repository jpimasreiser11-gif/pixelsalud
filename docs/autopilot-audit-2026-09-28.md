# VARINO Autopilot: auditoría y fases verificables

Fecha de corte: 28-09-2026. Esta nota distingue el sitio estático, el trabajo
local y lo que todavía no existe en producción. No es una aprobación legal ni
de lanzamiento.

## Estado observado

- El sitio está construido con Astro 7 y genera salida `static` (38 páginas en
  el build local). El workflow de publicación de
  `.github/workflows/deploy.yml` despliega a GitHub Pages.
- La API de identidad/workspace y la pantalla `/app/` se han añadido en esta
  rama para Pages Functions + D1 local. No hay cliente OAuth configurado, D1
  remoto ni despliegue de estas funciones; la API no está disponible en la web
  pública de GitHub Pages.
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

## Pruebas repetidas (baseline 28-09-2026)

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

## Verificación local de identidad (29-09-2026)

- `npm run functions:typecheck` y `npm run functions:build`: correctos.
- `npm run test:unit`: 56/56; incluye state cifrado, PKCE, validación de ID
  token, origen y atributos de cookie.
- `npm run test:d1`: migraciones y restricciones locales correctas.
- `npm run test:auth-runtime`: sesión, D1, aislamiento de dos tenants, creación
  concurrente/idempotente de workspace, rechazo de origen/campos manipulados,
  logout y revocación correctos con datos sintéticos.
- `npm run test:e2e`: 229 pasadas, 1 omitida; `/app/` comprobada en escritorio
  y móvil y sin hallazgos axe serios/críticos.
- `npm audit --audit-level=moderate`: 0 vulnerabilidades.

Estas pruebas demuestran solo el runtime local. El login real con Google sigue
pendiente de credenciales OAuth de desarrollo y el sitio público permanece en
GitHub Pages estático.

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

## Fase completada: núcleo D1 local

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

## Fase implementada: login OIDC y primer workspace (local)

Se añadieron Pages Functions para inicio/callback de Google OIDC, consulta de
sesión, logout y creación del primer workspace. El login pide solo identidad,
correo y perfil; usa state firmado, nonce, PKCE S256, validación del JWT y
sesiones opacas cuyo hash se almacena en D1. La página `/app/` no inventa
conexiones ni métricas. Las pruebas usan claves y cuentas sintéticas.

La función requiere `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`OAUTH_STATE_SECRET` y `APP_BASE_URL`. Ningún valor real está configurado; por
tanto no se ha probado un consentimiento Google real. Las rutas solo se
integrarán cuando Pages Functions y D1 se desplieguen; la versión live sigue
siendo estática. El detalle está en
[`autopilot-phase-1-auth.md`](./autopilot-phase-1-auth.md).

## Orden de construcción

1. Revisar la PR #13 y corregir la deriva pública. No desplegar hasta superar el
   gate legal y de seguridad.
2. Mantener el sitio público actual sin cambios de hosting. Cloudflare Pages
   Functions + D1 queda como runtime candidato para el SaaS y se ha probado
   localmente; GitHub Pages sirve archivos estáticos y no ejecuta la API.
3. Configurar el cliente OAuth de desarrollo y comprobar login, revocación de
   sesión y creación de workspace en runtime Pages local.
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

## Reconciliación del modelo local — 29-09-2026

- `ollama list` y `ollama show qwen3.6:27b` confirman el modelo instalado:
  27,3B parámetros, Q4_K_M, 17 GB y contexto de 262.144 tokens en esta máquina.
  El código de presupuesto, la guía y el planificador ahora prefieren ese tag;
  Qwen 3.8 se conserva como alternativa compatible si está instalado.
- Prueba HTTP local con petición sintética: el planificador devolvió un borrador
  validado con `executable: false` y `persisted: false`. El origen externo fue
  rechazado con 403 y el contenido que incluía una dirección de email se
  bloqueó con 400 antes de invocar el modelo.
- La suite E2E se ejecutó en puertos aislados del servidor Astro que ya estaba
  abierto en otro checkout. Resultado: 233 pasadas y 1 omitida. El primer
  intento usó por accidente ese servidor ajeno y dio 8 fallos por servir una
  build antigua; Playwright ahora no reutiliza servidores existentes salvo
  que se habilite explícitamente.
- Esta comprobación es local. No conecta el planificador con n8n, Google o
  Gmail, ni habilita login o ejecución para clientes.

## Revalidación de producción y n8n — 2026-09-29

- El PR #14 sigue abierto sobre `audit/legal-and-growth-20260926`, sin cambios
  locales pendientes y con estado de merge limpio. No se fusionó ni publicó.
- `npm run production:smoke` volvió a consultar la web pública y observó el SHA
  `d824d2cc8afb1d3711c943b94daa66230053567d`: 54 problemas en 11 páginas.
  Persiste la discrepancia entre lo público y esta rama: endpoints locales/de
  túnel en HTML, chat/analítica conectados pese al backend desactivado, recursos
  OG ausentes, falta de `noindex` en páginas previas al lanzamiento, sitemap
  prematuro, afirmaciones antiguas y 7 cabeceras HTTP ausentes en todas las
  páginas revisadas. `/og/varino-social.png` responde 404.
- `npm run launch:check` continúa bloqueando publicación por marca sin revisar,
  titular/NIF/domicilio vacíos y aprobaciones legal y de seguridad ausentes.
  No completar esos campos con datos inventados ni desplegar mientras falle el
  gate.
- Revisión read-only de n8n local: 17 flujos, 0 activos, 0 credenciales y 0
  ejecuciones. Los 17 exports locales coinciden con el runtime en nombres y
  conexiones; 16/17 también coinciden en nodos. El único delta son IDs internos
  del flujo manual de semillas, sin diferencias de parámetros ni conexiones.
  Pasaron 7 pruebas pytest de workflows, 9 de herramientas y 13 verificadores
  offline de seguridad. No prueba integraciones ni producción.
- No se hicieron POST, envíos, altas en CRM, llamadas a Google/Gmail/Calendar/
  Telegram, cambios DNS, activaciones, fusiones ni despliegues. La conexión de
  Sheets sigue esperando aprobación del propietario y posterior consentimiento
  OAuth en Google.

## Revalidación de integración y prelanzamiento — 30-09-2026

- En la rama candidata del PR #14 se integró la rama de prelanzamiento #13
  para resolver cuatro conflictos de CI, layout, estilos y pruebas de la guía.
  La resolución conserva las correcciones de prelanzamiento y los tests nuevos
  de autenticación/Pages Functions. Esta integración de ramas no fusiona la PR
  ni publica la web.
- Después de integrar, pasaron `npm run readiness` (39 páginas, SEO, enlaces,
  sintaxis, CSP y gate local), `npm run test:unit` (62/62), `npm run test:d1`,
  `npm run test:auth-runtime`, `npm run test:pages-runtime`,
  `npm run functions:typecheck`, `npm run functions:build`,
  `npm run claims:check` y `npm audit --audit-level=moderate` (0 vulnerabilidades).
- E2E con servidores aislados en puertos 4467/4468: 240 pasadas y 2 omitidas;
  incluye navegador de escritorio/móvil, páginas estáticas, estados legales,
  controles de privacidad y accesibilidad axe. Los 2 omitidos están declarados
  en la suite y no se cuentan como aprobados.
- La E2E usó datos sintéticos y mocks de APIs; no constituye un login Google,
  una integración real con D1 remoto, n8n, CRM ni envío. n8n local sigue con 17
  workflows, 0 activos, 0 credenciales y 0 ejecuciones.
- El smoke de solo lectura vuelve a observar `d824d2cc8afb1d3711c943b94daa66230053567d`
  en `varinoai.me` y falla con 54 problemas en 11 páginas; `security:origin`
  constata 7 cabeceras HTTP ausentes. La web pública no ha recibido los cambios
  de esta rama.
- `npm run launch:check` sigue bloqueado: falta la revisión OEPM/EUIPO,
  `legalOwner`, NIF, domicilio y las aprobaciones legales/de seguridad. No
  fusionar/desplegar ni dirigir anuncios mientras siga así.
- La pantalla de credenciales de n8n permanece vacía. Sheets OAuth requiere
  autorización explícita y consentimiento del usuario en Google; no se
  escribieron datos ni se enviaron correos durante esta revalidación.

### Revisión directa en la interfaz local de n8n — 2026-09-30

- La lista del proyecto sigue mostrando 17 workflows. El Overview muestra
  0 ejecuciones de producción, 0 fallos de producción y 0% de tasa de fallo.
  Esta lectura no certifica por sí sola el estado publicado de cada workflow.
- Las vistas de credenciales y Data tables muestran el estado vacío inicial:
  no hay OAuth guardado ni tabla CRM en n8n.
- Se abrió el formulario de Google Sheets OAuth2, sin guardar nada. Requiere
  Client ID y Client Secret; Guardar sigue deshabilitado. El callback mostrado
  es `http://localhost:5679/rest/oauth2-credential/callback`; la pantalla
  indica habilitar Google Drive API y Google Sheets API. No se introdujeron
  secretos ni se inició el consentimiento Google.
- La inspección de `VARINO · 1 lead-ingest` confirma un webhook POST, validación
  y normalización, comprobación del esquema CRM, lectura de IDs para evitar
  duplicados, escritura en Sheets, aviso Telegram y respuestas diferenciadas
  para inválidos, duplicados, guardado y fallo de persistencia. No se ejecutó:
  aún faltan credenciales y no hay prueba end-to-end.
- Siguiente gate: completar el cliente OAuth desde Google Cloud y aprobar el
  consentimiento en Google; después probar con datos sintéticos, verificar que
  solo se inserta una fila y que fallos de Sheets no devuelven éxito. Mantener
  los flujos de correo, cobro y aceptación sin publicar hasta revisar su lógica,
  consentimiento, idempotencia y pasos de aprobación humana.
