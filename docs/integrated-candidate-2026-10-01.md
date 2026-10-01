# Candidato integrado: diseño, recepción y operación local

Fecha: 1 de octubre de 2026. Rama de operaciones: `feat/autopilot-foundation`, PR #14. Integra la rama de diseño de PR #15 en `835912591ebf488a49556d036824b3c9d4744ca1`, sobre la base de operaciones `27ad333ddc44624296f4de3c832f72183cb7c96f`.

## Qué se integró y qué se conservó

- Tipografía del sistema, navegación claro/oscuro, respuesta discreta al pulsar, preferencias de contraste/transparencia y foco visible de la guía. No se reintroduce scroll reveal.
- Memoria de herramientas, volumen, proceso, aprobaciones y límites de datos al consultar precios en la guía. La orientación en el navegador no se presenta como inferencia remota ni como una propuesta aprobada.
- El formulario y sus capacidades, el buffer D1, la recuperación idempotente, el worker saliente, el panel y las Functions permanecen con los contratos de operaciones.
- El conflicto de configuración de navegador se resolvió conservando `VARINO_E2E=1`, la caché aislada de validación y la prohibición de reutilizar servidores ajenos por defecto. No se alteró el checkout que sirve el localhost del fundador.
- Publicación y verificación usan ahora el mismo npm 11 fijado. El gate verifica por separado las condiciones de rama de aprobación legal, cabeceras y deploy. Se añadieron 13 pruebas que rechazan variantes inseguras o instaladores diferentes, sin ejecutar despliegues.

## Evidencia obtenida para este candidato

| Comprobación ejecutada | Resultado y alcance |
| --- | --- |
| `npm run readiness` | Build y SEO, sintaxis, enlaces, CSP, gates; 40 HTML comprobados |
| `npm run test:unit` | 103 correctas; incluye 13 regresiones del deploy gate |
| Suite completa Playwright, puertos propios 4477/4478 | 297 correctas, 3 omisiones explícitas por dispositivo/puntero; escritorio/móvil, desarrollo/artefacto estático |
| Functions typecheck y bundle | Correctos |
| Auditoría de claims y configuración de cabeceras | Correctas; configuración no equivale a entrega del hosting |
| `npm audit --audit-level=moderate` | Cero vulnerabilidades conocidas notificadas en este momento |
| Backups n8n | 6 pruebas sintéticas correctas: WAL, integridad, permisos y rechazo de cambios/symlinks |
| Pages/D1, auth y abuso de login | Peticiones HTTP locales reales; aislamiento, CSRF, idempotencia, límites y reinicio correctos; sin OAuth real |
| Cola documental y recepción | APIs, D1, worker y navegador reales; los transportes n8n de estas suites estándar son simulados |
| Ensayo adicional de recepción con n8n real | Formulario → recibo persistente → respuesta inicial perdida → mismo recibo → worker → n8n aislado → Sheets simulado. Sin duplicado; consentimiento no verificado no entra en nurturing; append ambiguo y fallo del aviso manejados |
| Ensayo adicional de documentos con n8n y Qwen reales | Worker → webhook autenticado n8n aislado → `qwen3.6:27b` local → seis borradores guardados en D1 y visibles en el panel. Brief ficticio; no revisión humana de calidad ni entrega a clientes |

Los dos ensayos n8n usaron perfiles temporales con credenciales efímeras; esos perfiles se eliminaron al terminar. No importaron, activaron o autorizaron los workflows persistentes, no usaron cuentas reales de Google/Telegram y no enviaron correo.

Los exports aceptados estaban fijados y coincidían con la revisión previa: recepción `860533eb31f7b756d241e36014e822358890f88c1a9dd77b7fc28f05e9d2d05a`; documentos `0546a66da0927c7e4f93f7c4d4522c627bfa7cbafbe7616f9627e0211979fabe`. No se importó código del ZIP de terceros sin licencia acreditada.

## Reproducir sin confundir pruebas con producción

1. Ejecutar `npm run readiness`, unidades, typecheck/bundle, claims, cabeceras y auditoría de dependencias.
2. Ejecutar en serie las suites locales `test:n8n-backup`, `test:pages-runtime`, `test:d1`, `test:auth-runtime`, `test:oauth-rate-limit`, `test:document-jobs` y `test:inbound`.
3. Ejecutar `VARINO_E2E_PORT=4477 VARINO_E2E_PUBLISHED_PORT=4478 npm run test:e2e` con puertos libres. No compilar simultáneamente mientras otra suite valida `dist`.
4. Opcional, con los exports privados revisados e instaladores locales ya disponibles: `python3 scripts/test-inbound-n8n.py --workflow /ruta/privada/1-lead-ingest.json` y `python3 scripts/test-document-jobs-n8n.py --workflow /ruta/privada/17-documentos-ia.json`. Ejecutar uno después del otro. El segundo requiere el modelo local exacto; un modelo listado por Ollama no basta como prueba de inferencia.

## Pendiente, no resuelto por un merge o CI verde

Google OAuth/CRM real, Telegram, agenda, entregabilidad y permisos de email, pagos y facturación, backend remoto, Turnstile real y puesta en marcha supervisada con datos reales. El gate de lanzamiento continúa rechazando identidad legal vacía, revisión de marca y revisiones legal/de seguridad no acreditadas. No se crean aprobaciones ficticias, no se publica por el hecho de pasar estas pruebas y no se promete funcionamiento infalible.

La integración local y sus PR no actualizan por sí solas la web pública. GitHub Pages no ejecuta Functions ni aplica `_headers`; la operación remota de esta parte necesita un hosting compatible y autorizado.
