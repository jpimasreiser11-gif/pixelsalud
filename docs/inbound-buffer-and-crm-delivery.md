# Recepción persistente y entrega al CRM

Estado: implementado y probado en un entorno local con datos ficticios. No está desplegado en la web pública ni conectado a Google/Telegram reales. El formulario público sigue preparando un correo; aún no llama a esta API. **Este bloque no completa la conexión pública del formulario, el nurturing ni el ciclo de compra.**

## Recorrido y significado de cada estado

`POST /api/briefings` → buffer D1 → worker saliente del Mac → webhook privado `lead` de n8n → Google Sheets → confirmación del buffer.

Google Sheets sigue siendo el CRM y fuente de verdad. D1 solo retiene temporalmente las solicitudes por entregar y sus recibos técnicos. El worker no decide si alguien puede recibir publicidad, no envía correos y no ejecuta sistemas de clientes.

| Estado | Evidencia | Acción |
| --- | --- | --- |
| `pending` | Solicitud guardada de forma persistente | Esperar al worker; el Mac puede estar apagado |
| `claimed` | Una entrega está en curso | No enviar la misma solicitud desde otro canal |
| `crm_confirmed` | n8n respondió con el ID estable esperado tras comprobar su escritura/deduplicación | Consultar la ficha en el CRM; no implica email, reserva o venta |
| `manual_review` | Respuesta ambigua, salida inválida o lease vencido | Comprobar `Leads!O:O`, historial del proveedor y conectividad antes de reconciliar; no hay reenvío automático |
| `expired` | El buffer no confirmó la entrega y vencieron 30 días | Revisar la incidencia; la copia del contenido ya no está en D1 |

La escritura en Sheets no dispone aquí de una restricción transaccional única. Por eso se serializa el canal, se usa un ID estable, se comprueba antes de insertar y **no se reintenta un append ambiguo**. No se promete “exactly once” ni ausencia absoluta de fallos. La recuperación de una incidencia ambigua es humana; aún no existe un botón de reconciliación.

## Contrato de recepción

JSON estricto definido en `src/lib/inbound-contract.mjs`. Incluye nombre, email, empresa, teléfono opcional, servicio y una descripción breve. Máximo 8 KiB; campos acotados; no archivos, transcripción del chat, URL a ejecutar ni campos desconocidos. `submissionId` es una clave opaca de 64 caracteres hexadecimales, **no autenticación**. El mismo contenido y clave devuelve el mismo recibo; cambiar el contenido con la misma clave devuelve 409.

`privacy_acknowledged=true` confirma lectura de información, no opt-in comercial. `marketing_consent` vale false por defecto; solo una elección afirmativa guarda fuente versionada `contacto-marketing-checkbox-v1`. El servidor registra fecha y aviso `contact-request-v1`. Esta versión identifica el contrato técnico, no una aprobación jurídica del aviso aún pendiente.

La casilla tampoco verifica quién controla esa dirección. El worker conserva su elección en el recibo D1, pero transmite **`marketing_consent=false`** al flujo actual de Sheets: un lead nuevo no entra automáticamente en nurturing. Falta implementar/probar la confirmación de email y actualizar el registro con evidencia verificable antes de habilitar promociones. Es una decisión de prevención de abuso, no una afirmación de que toda norma imponga universalmente doble opt-in.

HTTP 202 confirma **solo recepción en el buffer**. No incluir nombre/email en la respuesta o atribuir ese 202 a Google Sheets, Telegram o Gmail. No hay endpoint público de consulta de solicitudes.

## Activación: cerrada por defecto

El endpoint requiere `VARINO_DB`, `APP_BASE_URL`, `AGENCY_WORKSPACE_ID`, `LEAD_WORKER_TOKEN_HASH`, `INBOUND_RATE_SECRET` e `INBOUND_CAPTURE_ENABLED=1`. El workspace debe estar activo. Los secretos se generan/inyectan desde gestores de credenciales, nunca se pegan en el repo, este documento, el navegador o el historial del terminal.

- Pruebas: `INBOUND_MODE=local-test`, **origen HTTP loopback explícito**, emails acabados en `.test`, teléfono vacío, token ficticio `XXXX.DUMMY.TOKEN.XXXX`. No llama al servicio Turnstile; las pruebas aportan solo datos ficticios. El filtro de dirección/teléfono no garantiza detectar datos reales incluidos en texto libre. Este bypass nunca funciona para HTTPS/hosts remotos.
- Futuro público: `INBOUND_MODE=production`, `launchReady=true` tras revisión real, HTTPS, aviso revisado coincidente y `TURNSTILE_SECRET` real (rechaza claves de prueba). Verifica Siteverify, hostname, acción `contact` y antigüedad del token. No adjunta IP a Siteverify. **Falta conectar y probar el widget del formulario, y revisar proveedor/aviso; no activar solo porque el backend existe.**
- Mismo origen requerido; no CORS; JSON/no-store/nosniff/DENY. Límite de 10 intentos por ventana de 15 minutos con HMAC temporal de la dirección que Cloudflare aporta; no guarda dirección cruda. Máximo 100 recibos nuevos por 24 horas. Si D1/límite no responde, falla cerrado.

## Worker local y reinicios

`npm run worker:inbound -- --once` ejecuta un ciclo; `npm run worker:inbound` consulta cada 15 segundos. Solo red saliente; ningún listener nuevo ni exposición pública de n8n/Ollama.

Configuración inyectada al proceso:

- `VARINO_CONTROL_URL`: raíz HTTPS del backend propio; HTTP solo loopback para ensayos.
- `VARINO_LEAD_WORKER_TOKEN`: token del worker. El backend guarda solo su SHA-256.
- `VARINO_N8N_LEAD_TOKEN`: secreto **distinto** de Header Auth `x-varino-lead-key` del webhook `lead`, almacenado en el gestor de n8n.
- `VARINO_N8N_PORT`: 5679 por defecto; el destino siempre es `127.0.0.1`, no una URL aportada por un visitante.

Comprueba salud local antes de reclamar. Solo un lease activo por workspace, 10 minutos. Nunca sigue redirecciones. Reintenta un acuse idéntico, no la escritura en n8n. Logs: estado/ID/código, no contenido, contactos ni cabeceras de autenticación.

La cola sobrevive a reinicios de Pages/D1. La instancia n8n existente arranca con `me.varino.n8n`; su procedimiento está en el runbook privado. **Este worker no se ha instalado como LaunchAgent:** faltan backend remoto y credenciales autorizadas. Para operación real hay que provisionarlos, fijar una única instancia de worker, instalar su arranque con secretos de un gestor y ensayar reinicios con CRM sandbox antes de habilitar el formulario. Si el taller está apagado, los recibos quedan pendientes; si cae durante un append, revisión manual, no reenvío silencioso.

## Privacidad y panel

`GET /api/inbound` exige la sesión de un OWNER activo del workspace de la agencia. Devuelve hasta 50 referencias/ID estable para buscar en el CRM/estados/servicio/fecha/elección comercial aún sin verificar; nunca payload, email, teléfono, nombre o lease. Otro workspace y el token de documentos no dan acceso al canal CRM. `/app/` muestra estos estados con actualización manual y advierte si están desactualizados.

Tras confirmar Sheets, se elimina inmediatamente la copia de contenido del buffer; queda recibo hash/estado/versión/elección de marketing para trazabilidad. Si no se confirma, contenido máximo 30 días: mantenimiento al recibir, consultar o reclamar. Si **nadie ejecuta esas rutas**, no existe una tarea programada independiente que garantice purga al segundo exacto. La política de recibos técnicos, supresión, copia en CRM, backups y derechos debe completarse y aprobarse antes del lanzamiento; vaciar este buffer no borra automáticamente Sheets ni backups. No hay garantía legal o de DLP completa.

Responder a una solicitud no autoriza promociones: [artículo 21 LSSI](https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758#a21). Requisitos de la verificación de tokens: [documentación oficial de Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [claves de ensayo](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

## Pruebas reproducibles y límites

1. `npm run build && npm run test:unit -- inbound && npm run functions:typecheck`.
2. `npm run test:inbound`: Pages Functions/D1/Chromium reales y transporte n8n simulado; prueba esquema/origen/límites, opt-in, deduplicación concurrente, una reclamación concurrente, recibo idempotente, reinicio, errores ambiguos, vencimiento, retención y aislamiento del panel.
3. Opcional, con n8n oficial ya instalado y el export privado revisado: `python3 scripts/test-inbound-n8n.py --workflow /ruta/absoluta/1-lead-ingest.json`. Solo acepta el SHA fijado tras lectura de su builder. Crea un perfil temporal privado, Header Auth efímera y adapta **solo transportes Google/Telegram** a fixtures en loopback. Ejecuta el flujo n8n real, preservando validación/mapas/ramas/respuestas; comprueba deduplicación, esquema/lectura fallidos, append ambiguo y fallo de aviso.

El tercer ensayo **no prueba OAuth de Google, una hoja real, un bot Telegram, el formulario público ni credenciales persistentes**. No importa/activa nada en el perfil operativo. No se enviaron emails ni mensajes reales. CI ejecuta 1–2, no el ensayo opcional con n8n local.
