# Lista de comprobación antes del lanzamiento

La web permanece con `noindex` y sin sitemap mientras no se hayan completado
las revisiones siguientes. `robots.txt` permite el rastreo para que los
buscadores puedan leer esa etiqueta; no lo bloquees como sustituto de `noindex`.

## Estado público observado — 29 septiembre 2026

Comprobaciones GET, sin enviar formularios ni escribir datos:

- `https://varinoai.me/version.txt` sigue sirviendo el commit
  `d824d2cc8afb1d3711c943b94daa66230053567d`, no esta rama.
- `npm run production:smoke` detectó 54 problemas en 11 rutas: túnel,
  webhook o endpoint local expuesto; chat/analítica activos; metadatos sociales
  y recurso OG incorrectos; indexación/sitemap habilitados antes de aprobar el
  lanzamiento; claims antiguos en portada; y siete cabeceras HTTP de seguridad
  ausentes en las 11 respuestas HTML.
- `npm run security:origin` confirma de forma independiente que el origen
  público no entrega HSTS, CSP de respuesta, `nosniff`, protección de iframe,
  política de referrer, Permissions-Policy ni COOP.
- El workflow actual publica con GitHub Pages. Que el artefacto incluya
  `public/_headers` no basta: la respuesta observada no aplica sus reglas. No
  aprobar el hosting ni habilitar el lanzamiento hasta que `security:origin`
  pase desde el dominio público. Cloudflare Pages documenta el procesamiento
  de `_headers` para respuestas de recursos estáticos; una migración requerirá
  cuenta, DNS/TLS y un despliegue/smoke verificados por separado:
  <https://developers.cloudflare.com/pages/configuration/headers/>.
- `npm run launch:check` permanece bloqueado por `launchReady=false`, revisión
  OEPM/EUIPO, titular/NIF/domicilio reales y aprobaciones legal y de seguridad.
  No se rellenan estos datos con valores supuestos ni se salta el gate.

## Identidad y marca

- Comprueba con la persona responsable que la identidad del titular, NIF,
  domicilio y canales de contacto publicados son correctos y pueden mostrarse.
- Confirma el control de `varinoai.me` y el correo profesional que se usará en
  la web y en los avisos.
- Registra la búsqueda y revisión de VARINO en OEPM/EUIPO; no declares la marca
  aprobada solo por haber buscado un nombre parecido.

## Revisión jurídica y privacidad

- Pide revisión profesional de aviso legal, privacidad, cookies/almacenamiento,
  contratación, cancelación y fiscalidad para el modelo concreto de VARINO.
- Identifica proveedores reales, ubicaciones, accesos, transferencias,
  conservación/borrado, copias y soporte para cada dato recogido por la web.
- Revisa los textos de IA y los contratos de tratamiento antes de incorporar
  datos de clientes. No recojas información sensible en demos o formularios.
- Guarda una aprobación fechada y su responsable en `ops/legal-review.json`;
  el archivo debe reflejar una revisión real, no ser un marcador para pasar la
  comprobación.

## Backend, seguridad y pruebas

- Comprueba que el dominio del backend resuelve al n8n previsto, con TLS, límites
  de abuso, validación de origen, protección de webhooks, registros mínimos y
  manejo de errores. No uses un túnel que apunte a otro servicio local.
- Verifica cada flujo de captura, chat, agenda, baja y analítica con cuentas de
  prueba; demuestra almacenamiento, supresión, idempotencia y recuperación sin
  enviar mensajes comerciales reales.
- Audita dependencias, accesos, credenciales, retención, exposición de puertos,
  copias y respuesta a incidentes. Guarda resultados y responsable en
  `ops/security-audit.json`; no marques aprobada una auditoría pendiente.
- Comprueba la web completa en escritorio y móvil, la accesibilidad, enlaces,
  formularios, agenda, baja y cabeceras del alojamiento final.
- El despliegue de producción verifica mediante GET que el origen público ya
  entrega las cabeceras HTTP requeridas antes de preparar el artefacto. El
  archivo `public/_headers` por sí solo no demuestra que el hosting las aplique:
  hay que verificar la respuesta real. Cloudflare Pages documenta el formato
  `_headers`; si se cambia de hosting, valida antes el dominio, DNS, TLS,
  redirecciones, cabeceras y smoke de punta a punta.
- Después de publicar una versión aprobada, ejecuta
  `VARINO_EXPECTED_VERSION=<SHA publicado> npm run production:smoke`. Este
  control hace solo peticiones GET y comprueba páginas clave, SHA publicado,
  CSP, ausencia del túnel/webhooks directos, claims antiguos, metadatos
  sociales, estado de indexación y recursos. Un `readiness` local verde no
  sustituye esta verificación de producción. Antes del lanzamiento, debe pasar
  en modo `noindex`; después, ejecuta el mismo control desde la versión con
  `launchReady = true` para exigir sitemap e indexación.

## Habilitar indexación

Solo tras cerrar las revisiones anteriores, una persona autorizada debe revisar
los artefactos y cambiar `src/lib/launch-config.mjs` a `launchReady = true`.
Después actualiza `public/robots.txt` para anunciar el sitemap, ejecuta
`npm run readiness`, `npm run launch:check` y las pruebas de navegador, y publica
mediante el proceso de revisión acordado. No publiques el sitio ni actives el
backend solo porque compile.

## Revalidación de rama — 29 septiembre 2026

- La rama candidata `feat/autopilot-foundation` (`e54510a`) se mantiene limpia;
  PR #14 sigue abierto y no se publicó desde esta revalidación.
- `npm run readiness`: PASS; 39 rutas generadas, SEO, enlaces internos,
  sintaxis, CSP y gate local de despliegue.
- `npm run test:unit`: PASS, 58/58. `npm run test:e2e`: PASS, 233/234; una
  prueba figura como omitida. La suite recorrió navegador de escritorio y
  móvil, HTML estático y desarrollo; Axe no encontró fallos en las páginas
  cubiertas. Se usaron puertos aislados, sin reutilizar el servidor del usuario.
- `npm run claims:check`: PASS en 40 archivos fuente. `npm run security:headers`
  valida la configuración local de `public/_headers`, pero no acredita que
  GitHub Pages entregue cabeceras HTTP.
- Repetición contra `https://varinoai.me`: continúa sirviendo
  `d824d2cc8afb1d3711c943b94daa66230053567d` y mantiene 54 hallazgos en 11
  páginas. `npm run launch:check` sigue bloqueado por marca, identidad legal y
  aprobaciones no disponibles; no se deben inventar ni omitir.
