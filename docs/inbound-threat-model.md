# Revisión de seguridad del buffer de solicitudes

Alcance: código del PR #14, Functions/D1 locales, worker saliente y ejecución de n8n en perfil temporal. No es una certificación ni una auditoría de infraestructura pública, Google OAuth o Telegram. La prueba con transportes de terceros simulados está etiquetada como tal.

## Límites de confianza

Visitante (contenido no confiable) → endpoint de recepción (esquema/origen/límite/challenge) → D1 (buffer) → worker autenticado y limitado a una clase de trabajo → n8n privado autenticado → Sheets (CRM).

La cuenta humana OWNER consulta recibos mínimos, no payloads. El token del taller documental no autoriza el canal CRM. El worker no recibe URLs de clientes, código, secretos externos ni permiso para enviar email, cobrar o implementar.

## Controles y pruebas

| Riesgo | Control | Evidencia local |
| --- | --- | --- |
| Alta abusiva o de terceros | Mismo origen, JSON estricto, 8 KiB, límites HMAC/global, adaptador challenge y validación del token | HTTP 403/400/413/429; cap de 100; unidad Siteverify host/acción/edad/error y widget simulado. Turnstile real todavía no está configurado ni probado |
| Convertir una solicitud en publicidad | Lectura de privacidad separada, checkbox false por defecto; elección no verificada no se transmite como consentimiento al nurturing | Unidad worker + n8n real con Sheets fixture: columna comercial `no` pese a checkbox solicitado |
| Robo de contactos entre espacios | Sesión activa + OWNER activo + workspace de la agencia | HTTP 401/403 del API real; listado sin nombre/email/teléfono/texto |
| Token en navegador o redirección | Secretos diferentes y cabeceras solo servidor-servidor; `redirect:error`; rechazo de Origin en worker | Unidades destinos/credenciales; HTTP token erróneo/documental/Origin rechazados |
| Duplicado por reintento/concurrencia | Clave única + hash de contenido + batch + UPDATE RETURNING + índice de un lease activo | 6 POST concurrentes → 1 recibo/1 audit; 2 claims → 1 job; resultados idénticos sin audit duplicado |
| Respuesta perdida al visitante después de guardar | Campos bloqueados, reintento con el mismo ID, recibo 202 estricto, sin fallback automático a email | Formulario Chromium → POST/commit reales → respuesta 503 simulada → reintento → un solo recibo/fila; nuevo envío exige acción explícita |
| Capacidades manipuladas o filtración al cliente | GET acotado del mismo origen; sin secretos/destinos; schema cliente diferido y fallo cerrado | Host externo/clave de test/campos extra rechazados; carga fallida sin POST; sessionStorage solo nonce opaco; ninguna petición de terceros en el ensayo |
| CRM escrito sin acuse | No reenvío automático tras timeout/error; lease vencido va a revisión humana | Worker transport failure; n8n fixture escribe y devuelve 503; reconciliación directa encuentra el ID sin append adicional |
| Falsa confirmación | 202 solo acredita buffer; CRM necesita ID exacto de una respuesta n8n `ok` | Un `{ok:true}` genérico no confirma el formulario; salida de otro ID rechazada; estados distintos visibles en Chromium |
| Fallo del aviso | Sheets es crítico; aviso posterior no crítico | n8n real con transporte de aviso 503 sigue confirmando el registro. No acredita Telegram real |
| SQL/HTML/SSRF/prompt injection | SQL parametrizado, sin ejecución de URLs/texto ni modelo en esta ruta; render con textContent | Revisión del código. No se interpreta contenido del lead en el panel; no hay herramientas agentes en la ruta |
| Pérdida al reiniciar | Buffer en D1; proceso local solo consulta saliente | Pages reiniciado conservando estado; worker procesa el recibo pendiente |
| Retención excesiva | Contenido se borra al confirmar CRM o por vencimiento de buffer, sin borrar CRM | HTTP/SQLite real local con datos sintéticos; política aún pendiente de aprobación pública |
| Fuga por logs/errores | Errores genéricos; worker solo ID/estado/códigos; n8n sin persistir payloads de ejecución | Errores/listado/audit sin fixture personal; export revisado `saveData* = none` |

## Limitaciones no resueltas por estos controles

- Un worker o gestor de n8n comprometido puede leer los trabajos que reclame y falsificar un acuse. Su token es un secreto de acceso a contactos; debe gestionarse/rotarse/revocarse y vigilarse como tal. No hay atestación independiente de cada escritura de Sheets desde D1.
- Sheets append no ofrece la restricción `UNIQUE` usada por D1. Reconciliar un append ambiguo requiere inspección humana del ID y no está automatizado en la UI. Las demás vías de alta deben permanecer privadas/serializadas.
- Un límite por dirección puede afectar a equipos bajo NAT y no impide por sí solo un ataque distribuido. Faltan pruebas reales de Turnstile/widget/WAF/hosting y carga antes de lanzar.
- Solo email `.test` y teléfono vacío se validan en modo local. Texto libre/nombre/empresa no tienen DLP completo. Los ensayos aportaron datos ficticios; el bypass solo admite origen loopback.
- No se ha desplegado D1 remoto, supervisor de worker, confirmación de email, políticas completas de DSAR/retención del CRM/backups ni credenciales autorizadas de Google/Telegram. No habilitar el formulario ni nurturing con estas piezas ausentes.
- La purga del buffer ocurre al usar sus rutas, no mediante un servicio independiente ya instalado. Con el sistema completamente apagado no se garantiza una hora exacta de purga. Los recibos pseudónimos también deben incluirse en la revisión de retención.
- `npm audit` cubre hallazgos conocidos de las dependencias declaradas al momento del ensayo, no prueba ausencia de vulnerabilidades ni seguridad del Mac/proveedores.

Las reglas de activación y los comandos reproducibles están en [el runbook de este bloque](./inbound-buffer-and-crm-delivery.md). No se creó ningún archivo de aprobación legal/de seguridad para vencer el gate de lanzamiento.
