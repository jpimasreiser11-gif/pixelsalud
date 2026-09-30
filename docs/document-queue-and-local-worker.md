# Taller documental: cola duradera y trabajador local

## Alcance y estado

Implementado en la rama `feat/autopilot-foundation`, pendiente de revisión y despliegue. No es una integración de producción ni un ejecutor SaaS multicliente. El circuito prepara los seis documentos internos de la agencia: diagnóstico CAIO, mapa del bucle, PRD, implementación, adopción y recurrencia. No conecta cuentas, envía comunicaciones, firma, compra, cobra ni implementa el plan.

La instancia persistente de n8n continúa con los 17 flujos inactivos y sin credenciales. Las pruebas integrales publican únicamente una copia del flujo documental en un perfil temporal que escucha en loopback; se eliminan el perfil y las credenciales de prueba al finalizar.

## Límites de uso

- Solo el propietario activo del workspace interno fijado por el servidor puede solicitar o leer documentos. Los demás espacios, incluidos los de clientes, no pueden usar este trabajador.
- Una solicitud por versión del plan; dos clics o peticiones simultáneas no generan dos trabajos.
- Máximo veinte solicitudes nuevas por workspace en una ventana móvil de veinticuatro horas.
- El brief procede del plan validado ya guardado. El navegador no puede aportar una URL, instrucciones ejecutables, una transcripción ni una credencial al trabajador.
- Se rechazan patrones detectables de datos personales y secretos; esto no es una garantía de detectar toda información sensible. El operador debe revisar el contenido antes de introducirlo. No se admiten datos reales de clientes en esta fase.
- Los seis documentos son texto sin interpretar HTML. Tienen advertencias de borrador y revisión humana; no se aceptan presupuestos, métricas o garantías inventadas en forma de los patrones bloqueados. La revisión humana sigue siendo obligatoria.

n8n permanece destinado a operaciones internas de la agencia. No activar ejecución multicliente ni alojar sus workflows/credenciales bajo este diseño sin resolver previamente la licencia. La [guía oficial de licencias de n8n](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case) distingue consultoría sobre instancias del cliente, hosting de sus workflows y uso Embed.

## Recorrido y recuperación

`/app/` → `POST /api/document-jobs` → D1 → trabajador saliente → webhook privado n8n → Ollama local → validación → D1 → documentos visibles en `/app/`.

Estados: `pending` (en cola), `claimed` (preparando), `completed` (revisión humana), `manual_review` (reintentos detenidos).

El claim usa un único `UPDATE … RETURNING`: un trabajo solo se asigna a un trabajador en cada intento. La concesión dura diez minutos. Se conserva solo el hash de su clave. Si el proceso termina o el Mac está apagado, el trabajo sigue en D1; al expirar se puede recuperar. Como la concesión puede caducar durante un fallo de red, la generación es **al menos una vez**, no exactamente una: no tiene efectos de negocio y solo un resultado autorizado queda confirmado.

Se permiten tres intentos. Un fallo confirmado vuelve a la cola con espera de treinta y sesenta segundos; el tercero pasa a revisión manual. La última concesión agotada también se detiene cuando caduca. No hay reintentos infinitos ni un reintento manual oculto. Repetir una confirmación idéntica es idempotente; una clave anterior o una salida diferente no puede reemplazar un resultado terminado.

Si el taller está apagado, las solicitudes esperan; no se anuncia que están completadas. El panel actualiza los trabajos pendientes y deja de consultar cuando la página está oculta. Si falla la actualización, avisa de que los datos mostrados pueden estar desactualizados.

## Configuración pendiente para operación persistente

Se necesita hosting con Pages Functions y una D1 real: GitHub Pages por sí solo no sirve estos endpoints. No se creó ninguna cuenta, base remota, túnel o secreto de producción durante este bloque.

En el gestor de configuración/secretos del hosting:

| Clave | Valor y uso |
|---|---|
| `APP_BASE_URL` | Origen HTTPS raíz de la aplicación, sin credenciales ni ruta adicional. |
| `AGENCY_WORKSPACE_ID` | ID del workspace interno verificado de VARINO; nunca uno elegido por un visitante. |
| `DOCUMENT_WORKER_TOKEN_HASH` | SHA-256 hexadecimal de una clave aleatoria exclusiva del trabajador. Secreto de configuración; no valor de ejemplo ni clave embebida en el código. |
| `VARINO_DB` | Binding de D1; aplicar las cinco migraciones antes de admitir solicitudes. |

En el proceso local, inyectados desde un gestor de secretos (no escribirlos en el repo, plist, historial ni mensajes):

| Clave | Valor y uso |
|---|---|
| `VARINO_CONTROL_URL` | El mismo origen HTTPS. HTTP solo está permitido para pruebas loopback. |
| `VARINO_DOCUMENT_WORKER_TOKEN` | La clave cuyo hash está configurado en el hosting. |
| `VARINO_N8N_DOCUMENT_TOKEN` | Clave distinta, guardada como Header Auth de n8n; nombre de cabecera `x-varino-document-key`. |
| `VARINO_N8N_PORT` | Puerto local; por defecto `5679`. La dirección y la ruta están fijadas a `127.0.0.1` y `/webhook/document-pack-draft`. |

El trabajador no abre puertos, no sigue redirecciones y nunca devuelve al navegador estas claves ni la dirección de n8n. El servicio n8n y Ollama continúan privados; no se necesita un túnel hacia ellos.

Con esa configuración inyectada, `npm run worker:documents -- --once` procesa como máximo un trabajo. `npm run worker:documents` consulta secuencialmente cada quince segundos; sus logs solo incluyen IDs y estados/códigos permitidos. Si una autenticación es rechazada, se detiene; no intenta eludirla. Debe instalarse bajo un supervisor con arranque de sesión/reinicio una vez comprobada la configuración real. **No está instalado como servicio persistente todavía**: el destino remoto y las credenciales de operación no están configurados.

Antes de activar el flujo documental real: configurar Header Auth en el gestor de n8n, confirmar el workspace del propietario, ejecutar el drill con datos ficticios, probar el endpoint de producción con un receptor controlado, y verificar la persistencia del trabajador tras reiniciar. No activar por ello los flujos de correo, CRM, agenda o Stripe.

## Pruebas reproducibles

Desde la raíz del repo:

```sh
npm run build
npm run functions:typecheck
npm run test:unit
npm run test:document-jobs
```

`test:document-jobs` levanta Pages/D1 temporal, hace peticiones HTTP reales y abre Chromium contra esa API. Cubre autenticación, origen, aislamiento, solicitudes simultáneas, claim atómico, resultados rechazados, replay, backoff, detención y reinicio. Por defecto **simula únicamente la respuesta de n8n** con un servidor HTTP local y lo dice en la salida.

La prueba opt-in real usa el export privado auditado de `17-documentos-ia.json`, fijado por SHA-256 `0546a66da0927c7e4f93f7c4d4522c627bfa7cbafbe7616f9627e0211979fabe`:

```sh
python3 scripts/test-document-jobs-n8n.py --workflow /ruta/absoluta/al/export/17-documentos-ia.json
```

Requiere el n8n instalado y el modelo local `qwen3.6:27b`. Rechaza exports diferentes: hay que auditarlos y fijar su nueva huella antes de probarlos. Comprueba Header Auth, rechazo de PII sintética y el circuito HTTP real hasta Qwen y la devolución de los documentos. No usa el perfil persistente, servicios Google, Telegram, correo, pagos ni datos de clientes. La pasada de CI no ejecuta esta inferencia local; son verificaciones distintas.

## Pendientes que este bloque no certifica

Despliegue HTTPS, OAuth real de acceso a `/app/`, D1 remota, gestor de secretos y supervisor del trabajador; pruebas con datos reales autorizados, retención/borrado, monitorización externa y recuperación ante pérdida del disco; integraciones de CRM, calendario, Gmail, Telegram y pagos; licencias y revisión legal. Una prueba local satisfactoria no convierte estos pendientes en servicios operativos para clientes.
