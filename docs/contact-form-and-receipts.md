# Contacto: capacidades, recibos y recuperación

Estado: código y circuito local probados con datos ficticios. La web pública no se ha actualizado; cuentas Google/Telegram, widget Cloudflare y backend remoto siguen pendientes. No confundir un recibo técnico con cliente, consentimiento comercial verificado, reserva, presupuesto o compra.

## Recorrido visible

| Situación | Comportamiento del formulario |
| --- | --- |
| Sin backend habilitado/configuración inválida | Preparar correo o copiar briefing en el dispositivo. No guardar ni enviar; abrir el correo es una acción explícita |
| Capacidad local habilitada | Aviso visible de ensayo; solo email `.test` y teléfono vacío. Nunca challenge externo |
| Capacidad de producción aprobada | Información de privacidad obligatoria; novedades opcionales/desmarcadas. Challenge después de un envío válido |
| Validación o su carga falla | Mantener campos editables y contenido; no enviar ni afirmar recepción |
| Recepción sin confirmar | Mantener contenido bloqueado para no cambiar el mismo envío; botón «Confirmar el mismo envío» y copia manual. Nunca correo automático |
| HTTP 202 y recibo exacto | Mostrar referencia con foco accesible, mantener contenido, impedir envío doble; informar solo de recepción |
| Solicitud nueva | Acción explícita después del recibo; limpiar formulario/casillas y rotar nonce |

El rechazo definitivo de campos por el servidor permite corregirlos. Challenge caducado admite una verificación nueva con el mismo ID. Un 429 pide esperar; un conflicto requiere revisión, no otro envío automático. Sin conexión no hay un envío diferido oculto.

## Código y datos mínimos

- `src/pages/contacto.astro`: contenido, labels, ayudas, campos, casillas, recibo y estilos claro/oscuro. Respeta movimiento reducido.
- `src/lib/contact-form.mjs`: capacidades cerradas, validación diferida, identificador estable, challenge, envío y recuperación.
- `src/lib/contact-notice.mjs`: identificadores públicos del contrato. No son una aprobación legal.
- `src/lib/inbound-contract.mjs`: esquema compartido estricto y orden estable del registro. La librería se descarga solo tras enviar un formulario válido contra un backend habilitado; no durante visitas/borradores locales.
- `functions/api/briefings/config.ts`: metadatos públicos, sin credenciales, workspace ni destinos de terceros. Falla cerrado si el workspace/configuración no está operativo.
- `functions/api/briefings.ts` y worker: [contrato, entrega, incidentes y retención](./inbound-buffer-and-crm-delivery.md).

Solo el nonce opaco de idempotencia va a `sessionStorage`; no se guarda ahí nombre, email, empresa, teléfono o descripción. El contenido permanece en memoria/los campos de esta página, no se persiste automáticamente para recuperar un cierre del navegador. Copiar usa el portapapeles solo a petición del visitante. Un borrador `mailto:` contiene los campos solo en ese enlace local, que se oculta al habilitar recepción.

La casilla de novedades no acredita control del email: el worker mantiene `marketing_consent=false` en el flujo CRM actual hasta implementar confirmación verificable. No se ha habilitado nurturing. El texto libre no dispone de DLP completo; los ensayos usaron nombres/empresas ficticios.

## Widget y política de contenido

La site key es pública; la secret key queda exclusivamente en el gestor del backend. El adaptador solicita un widget nuevo con acción `contact`, sin pasar los campos del briefing; maneja carga/caducidad/error y elimina el widget. No evita que el proveedor vea metadatos normales de conexión/navegador, que deben cubrirse en la revisión de privacidad.

La fuente CSP común es `src/lib/content-security-policy.mjs`. El build genera `dist/_headers` desde la plantilla conservadora `public/_headers`; desarrollo, meta y cabeceras se contrastan en los gates. Mientras `launchReady=false`, **no se permite ningún script/frame de terceros**. La política futura revisada admite solo el origen exacto `https://challenges.cloudflare.com` para script y frame, sin comodines, `unsafe-inline`, `unsafe-eval` ni acceso del navegador a n8n/Ollama. GitHub Pages no ejecuta Functions ni aplica `_headers`.

Pruebas del adaptador y Siteverify usan respuestas simuladas. **No acreditan que Cloudflare real funcione**. Antes de captar datos reales se requieren backend HTTPS/D1, titular/aviso/proveedor revisados, claves de widget válidas con hostname correcto, credenciales autorizadas y recuperación/arranque del worker. No activar mediante un flag aislado ni aprobación ficticia.

Referencias primarias: [render explícito de Turnstile](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/), [CSP de Turnstile](https://developers.cloudflare.com/turnstile/reference/content-security-policy/), [validación servidor](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## Pruebas reproducibles

Ejecutar build y gates antes de servir o comprobar el artefacto; no lanzar otra compilación simultánea mientras se valida `dist`.

1. `npm run readiness && npm run test:unit && npm run functions:typecheck && npm run functions:build && npm run security:headers && npm run claims:check`.
2. `VARINO_E2E_PORT=4339 VARINO_E2E_PUBLISHED_PORT=4469 npm run test:e2e`: puertos dedicados; no reutilizar servidores de otros checkouts.
3. `npm run test:inbound`: Pages/D1/Chromium reales, transporte n8n simulado. El navegador guarda de verdad; solo se simula la pérdida de la primera respuesta tras commit. Reintenta y recupera un único recibo, entrega mediante el worker, confirma eliminación de la copia D1 y comprueba modo oscuro móvil/movimiento reducido.
4. Opcional: `python3 scripts/test-inbound-n8n.py --workflow /ruta/absoluta/1-lead-ingest.json`, con el export privado revisado fijado por SHA. Conserva las ramas reales de n8n y sustituye únicamente transportes Sheets/Telegram por fixtures loopback. No modifica el perfil operativo.

La variable opcional `VARINO_TEST_CONTACT_SCREENSHOT` recibe una ruta absoluta privada para la captura del ensayo. No generar una captura real con datos de clientes ni publicarla por defecto.

La suite de desarrollo preoptimiza Zod y usa una caché dedicada (`VARINO_E2E=1`) para que el build estático concurrente no invalide la sesión interactiva con `Outdated Optimize Dep`. Esto no desactiva la toolbar, no aumenta timeouts, no omite pruebas y no cambia el servidor local del fundador. Los ensayos son evidencia de los estados cubiertos, no una promesa de infalibilidad o conformidad legal completa.
