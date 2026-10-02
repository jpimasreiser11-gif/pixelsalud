# Baja durable: preparación verificada, no campaña activada

## Qué acredita este bloque

Página /baja/, confirmación explícita por POST, registro de oposición en D1,
outbox cifrada, worker local hacia el motor n8n y consulta privada previa al
envío. Los ensayos usan únicamente destinatarios ficticios .test, D1 local y
transportes sintéticos; el ensayo ampliado conserva n8n real en un perfil
desechable. No acredita permisos Google reales, envío Gmail, consentimiento,
identidad legal, despliegue Cloudflare ni lanzamiento del sitio.

El diseño apple-design aporta jerarquía clara, respuesta inmediata, estados
honestos, controles grandes y preferencias de accesibilidad. La página no
incluye chat ni analítica; abrirla no cambia nada ni llama al API de baja.

## Contrato de seguridad

- Enlace con token aleatorio de 256 bits en el fragmento, sin email ni query.
  El servidor guarda solo SHA-256 del token. El navegador retira el fragmento
  de su historial visible y mantiene el token exclusivamente en memoria.
  No se exportan enlaces/token a registros ni capturas.
- Confirmación sin cuenta ni CAPTCHA: POST /api/unsubscribe, JSON estricto,
  mismo origen y cuerpo máximo de 256 bytes. GET/HEAD/OPTIONS no modifican
  el registro. No CORS; respuestas sin caché.
- La oposición y la outbox se crean en un único batch transaccional. Fallar
  cualquier insert revierte también el consumo del token; solo se informa
  éxito después de comprobar registro + outbox. Duplicados y respuesta perdida
  no crean más eventos. Véase [batch D1](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).
- Ledger mínimo por workspace: identificador HMAC del email normalizado,
  ID opaco de evento y fecha. HMAC/AES-GCM derivan claves separadas por HKDF y
  workspace. Los emails se cifran con nonce aleatorio y autenticación ligada
  al workspace/identificador; no se guardan en claro.
- La oposición no vence cuando falla el CRM, el worker, una lease o el payload.
  Nunca se reactiva el consentimiento como efecto de una baja. suppressed:
  false solo significa ausencia en este ledger, **no autorización comercial**.
- Consulta de oposición mediante el binding D1 normal al primario. No cambiar
  a una réplica eventualmente consistente en el camino previo al envío.
  [Consistencia D1](https://developers.cloudflare.com/d1/best-practices/read-replication/).
- Tres credenciales server-to-server diferentes: emisión, sincronización y
  consulta. Sesiones del navegador, cookies u Origin nunca sustituyen estas
  credenciales. Las respuestas públicas no revelan la dirección ni su hash.
- Límites técnicos: emisión autenticada de 1.000 enlaces por workspace/día;
  enlaces sin usar caducan a los 365 días. Un enlace caducado indica recurrir
  al correo original. Política de retención pendiente de revisión del operador:
  esos límites no son una afirmación de cumplimiento legal.

## Datos y retención

Migración 0007_durable_suppression.sql:

1. unsubscribe_tokens: hash del enlace, destinatario seudónimo y email
   cifrado hasta confirmación o caducidad. Confirmar purga esa copia cifrada.
2. mail_suppressions: oposición mínima persistente independiente del CRM.
   Sigue siendo dato seudónimo, no dato anónimo ni un nuevo opt-in.
3. suppression_outbox: copia cifrada necesaria para sincronizar Supresion.
   Confirmación CRM la purga inmediatamente; fallos conservan hasta 30 días.
   Vencimiento purga payload sin quitar el bloqueo.

La limpieza corre al emitir, confirmar, reclamar trabajo y en cada vuelta del
worker, mediante /api/unsubscribe/maintenance, incluso si n8n no responde.
**No hay purga remota garantizada mientras el equipo/worker esté apagado**. Antes de
producción, programar y comprobar mantenimiento remoto sin tráfico, backups,
derechos de interesados y conservación de oposición conforme a política real.
No borrar ni rotar la clave de privacidad sin migrar todos los identificadores
y cifrados: perderla haría imposible reconocer las oposiciones anteriores.

## Configuración (valores secretos solo en gestores)

Bindings Pages: VARINO_DB, APP_BASE_URL (origen exacto), AGENCY_WORKSPACE_ID,
UNSUBSCRIBE_MODE, UNSUBSCRIBE_ISSUANCE_ENABLED,
UNSUBSCRIBE_ISSUER_TOKEN_HASH, UNSUBSCRIBE_SYNC_TOKEN_HASH,
SUPPRESSION_CHECK_TOKEN_HASH, SUPPRESSION_PRIVACY_KEY.

Los tres hashes son SHA-256 de tokens diferentes. La clave de privacidad es
32 bytes aleatorios en base64url. Nunca usar ejemplos, incluir valores en
Git/PR, pasar secretos reales en argv ni imprimirlos.

local-test solo acepta origen HTTP de loopback y emails .test; producción
requiere HTTPS. Un flag no puede abrir emisión comercial mientras
launchReady=false. Desactivar emisión **no** desactiva enlaces ya emitidos:
mantener bindings/clave/API para atender bajas aunque una campaña se detenga.

El worker recibe del gestor local VARINO_CONTROL_URL,
VARINO_SUPPRESSION_SYNC_TOKEN, VARINO_N8N_UNSUB_TOKEN y opcionalmente
VARINO_N8N_PORT (5679 por defecto). Se conecta a n8n exclusivamente por
loopback; nunca expone el editor ni acepta destinos aportados por visitantes.

    npm run worker:suppression -- --once
    npm run worker:suppression

Sin claves, falla sin mostrar valores. El bucle atiende SIGTERM/SIGINT; no
instala por sí solo LaunchAgent ni credenciales. Para sobrevivir a un reinicio
del equipo hace falta registrar y probar un servicio local con inyección segura
desde el gestor; **todavía no está instalado en el runtime persistente**.

## Sincronización, errores y recuperación

El worker mantiene la retención y comprueba salud n8n antes de reclamar una lease de diez minutos.
Reclama solo una baja a la vez por workspace. Envía una vez a
/webhook/unsub-sync, Header Auth x-varino-unsub-key, valida respuesta y
eventId exactos. Una respuesta HTTP 200 sin supresión confirmada no es éxito.

Solo se reintenta el mismo ACK a D1, nunca el append ambiguo. Timeout,
confirmación inválida o lease vencida pasan a revisión. El ledger sigue
bloqueando. Un resultado confirmado conserva el recibo técnico y purga email.

Reconciliación humana: consultar Supresion con acceso autorizado; si el evento
está guardado, confirmar ese efecto con la lease/recibo adecuado o un futuro
procedimiento administrativo autenticado. No editar estados para forzar un
reenvío ni hacer público el CRM. No existe aún pantalla de reconciliación.

## Prueba reproducible

    npm run build
    npm run test:suppression
    VARINO_TEST_UNSUBSCRIBE_E2E=1 npm run test:unsubscribe-native

El último necesita n8n ya instalado. No instala software ni cambia el perfil
persistente. Prueba la cadena navegador → Pages/D1 → worker → n8n real →
fixture Sheets → ACK, una escritura sintética y cero payloads retenidos por el
perfil temporal. No convertirlo en evidencia de OAuth o Gmail reales.

### Evidencia local del 2 de octubre de 2026

La ejecución ampliada terminó con cuatro PASS: contrato n8n nativo, cadena
Chromium/Pages/D1/worker/n8n con exactamente una escritura ficticia, cero
payloads de ejecución en el perfil temporal y limpieza de ese perfil. El perfil
persistente no fue modificado. También se comprobaron rollback transaccional,
reintento después de perder la respuesta, deduplicación concurrente, reinicio,
retención con n8n fuera de servicio, rechazo de credenciales cruzadas y fallo
cerrado cuando el ledger no está disponible.

La página pasó axe en escritorio, móvil, tema oscuro y movimiento reducido sin
infracciones detectadas. Estos resultados no prueban accesibilidad universal,
seguridad absoluta, entrega Gmail ni funcionamiento en el hosting público.

## Gates antes de enviar un correo real

1. Resolver el 403 de Google; comprobar efecto en hoja real de prueba autorizada.
2. Desplegar Functions/D1 con secretos, HTTPS y backups. GitHub Pages no ejecuta
   estas rutas. No publicar un enlace que termine en un hosting solo estático.
3. Instalar/probar worker y mantenimiento tras reinicio del equipo.
4. **Cablear /api/unsubscribe/check justo antes de cada Gmail** en los flujos
   5/11 y cualquier canal nuevo, además de releer Supresion. Error,
   timeout, respuesta mal formada o suppressed:true bloquean; una consulta
   antigua no vale. El helper preparado se llama checkDurableSuppression.
   Los flujos comerciales persistentes aún NO usan esta API.
5. Obtener enlace privado de /api/unsubscribe/issue y añadirlo a todas las
   plantillas antes de generar RFC822. Actualmente mantienen baja por respuesta;
   **no se ha cambiado a enlaces públicos sin un backend desplegado**.
6. No añadir List-Unsubscribe-Post ni anunciar RFC 8058: este enlace exige
   confirmación humana y no implementa una ruta one-click compatible.
7. Consentimiento/inbox verificado, identidad legal, alcance aprobado,
   integración real de Gmail y prueba con un destinatario propio autorizado.

Todos los flujos comerciales siguen inactivos. Esta preparación es un bloque
necesario, no una agencia ya autónoma ni un lanzamiento público.
