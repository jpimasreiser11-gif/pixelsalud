# Correo: oposición comprobada antes de Gmail

## Entrega y límites

`automation/n8n/add-durable-mail-gate.py` prepara una copia inactiva de los
flujos 5 (nurture) y 11 (seguimiento). No importa, activa, crea credenciales ni
envía mensajes. Preserva IDs, notas y controles previos de ejecución,
consentimiento, reserva CRM, supresión Sheets y respuestas pendientes.

La copia añade el ledger de [baja durable](durable-unsubscribe.md), que puede
bloquear una dirección aunque su baja aún no se haya sincronizado con Sheets.
Una consulta sin bajas nunca sustituye consentimiento, identidad del operador
ni los demás controles comerciales. Las plantillas conservan baja por respuesta;
la emisión e inclusión del enlace público es un bloque separado pendiente.

Los exports persistentes NO se han sustituido ni activado. No acreditar una
campaña real o una protección instalada basándose solo en estos ensayos.

## Recorrido y decisiones

1. El gate comercial previo debe haber autorizado el mensaje y su reserva.
2. Validar destinatario durable compara el único To RFC822 con la dirección de
   la fila reservada. Rechaza manuales, caducados, base64 inválido, destinatario
   distinto, Cc/Bcc, Resent y encabezados duplicados o plegados. Los casos de
   entrada inválida detienen el flujo sin llamar al ledger; requieren revisar
   la reserva y el error, no un reenvío automático.
3. Comprobar baja durable hace un único POST autenticado al origen HTTPS exacto
   de VARINO. Solo transmite email. Timeout ocho segundos; sin redirects ni
   reintentos, incluso entre orígenes. Token dedicado en gestor Header Auth.
4. Autorizar baja durable acepta únicamente HTTP 200 y objeto exacto
   `{suppressed:false}`. Error, true, string, campos extra, timeout y respuesta
   tardía van a la rama de revisión existente. No renueva permisos antiguos.
5. Gmail exige ambos permisos vigentes y el mismo RFC822 que se validó. El
   permiso durable dura como máximo cinco segundos y nunca supera el plazo del
   permiso previo. Ningún nodo intermedio ni Wait; no retry de Gmail.

No es una transacción distribuida con Gmail: no puede retirar un mensaje ya
aceptado ni garantizar que no cambie un permiso entre consulta y aceptación.
No ejecutar varias instancias; mantener el guardián de ejecución serial previo.
Una reserva ambigua sigue necesitando reconciliación humana.

## Preparación segura

    python3 automation/n8n/add-durable-mail-gate.py --input EXPORT_PRIVADO --output COPIA_NUEVA_PRIVADA --kind nurture
    python3 automation/n8n/add-durable-mail-gate.py --input EXPORT_PRIVADO --output COPIA_NUEVA_PRIVADA --kind followup

Salida con modo 0600 y active:false incluso para un source sin flag de activación;
ese source no acredita estado del runtime. Archivo existente, export activo, nuevo destino,
credencial con formato de valor, bypass alternativo a Gmail o gate previo
ausente detienen la preparación. La credencial queda como referencia
`REPLACE_WITH_SUPPRESSION_CHECK_CREDENTIAL_ID`, nunca un secreto en JSON.
Tras crearla en el gestor, `--check-credential-id` acepta su ID de referencia.

La credencial dedicada usa cabecera Authorization y el bearer de consulta del
ledger. Su hash corresponde solo a SUPPRESSION_CHECK_TOKEN_HASH, no a emisión
o sincronización; restringir su dominio a varinoai.me. Nunca pegar el valor en
argumentos, código, chat o exports. El backend sigue sin desplegar: 404/503
deben bloquear, no permitir enviar con Supresion como único fallback.

Antes de importar: verificar snapshot/rollback, permisos Google, retención del
perfil real, API del dominio y destinatario propio autorizado. Importar la
copia inactiva y comprobar el grafo persistido. Activación manual en n8n solo
después de pruebas reales y gates comerciales. Regenerar un export exige aplicar
otra vez este gate y validar el resultado; no importar el builder anterior solo.

## Pruebas y alcance exacto

    npm run test:mail-durable-contract
    npm run test:mail-durable-native
    npm run test:mail-durable-complete -- --ops-dir DIRECTORIO_PRIVADO_DE_OPERACIONES

Contrato offline para las dos variantes: preservación, ausencia de bypass,
restricción de destino/credencial, no sobrescritura, vinculación RFC822 y
rechazo de permiso/cuerpo/tiempo inválidos. Forma parte de CI.

Ensayo nativo explícito: n8n instalado, perfil desechable, nuevo Code/IF y
expresiones sin alterar, Header Auth real, fixture del contexto aprobado
previo y transportes solo loopback. Comprueba clear/blocked, 503, datos
ambiguos, timeout, 302 sin redirección, mezcla de items y destinatarios ocultos.
El remitente es ficticio; no prueba consentimiento real, Gmail, Google,
guardia serial del perfil real ni el recorrido completo de los flujos 5/11.
Verifica directamente cero payloads retenidos en el perfil temporal, que se
elimina junto con las credenciales al terminar. No extrapolar al perfil real.

Verificación local del 2 de octubre de 2026: cuatro tests de contrato y
veintidós ejecuciones de casos nativos para las dos variantes terminaron
correctamente. Se confirmó cero retención en el perfil temporal y su limpieza.
Se prepararon copias privadas de los sources reales de los flujos 5/11,
con active:false; no se importaron. El éxito nativo descrito es del guard,
no una afirmación de entrega real o del workflow comercial completo.

El ensayo `test:mail-durable-complete` acepta exclusivamente los SHA-256
revisados de ambos sources y sus helpers privados. Si cambia un fichero, exige
auditarlo otra vez; no actualiza pins automáticamente. Extrae las cabeceras
literales por AST, sin abrir la configuración privada del CRM ni importar su
módulo. Mantiene los Code/IF y el guard nuevos, sustituyendo solo transportes,
autenticación de fixture y la identidad ficticia del operador.

Ejercita los recorridos completos con Schedule Triggers reales en un perfil
desechable: cinco reservas/consultas, cuatro envíos/confirmaciones ficticios y
una oposición durable bloqueada por variante. Repite las programaciones tras
reiniciar el mismo perfil/CRM ficticio y exige cero efectos adicionales.
Comprueba la cola de producción a uno y el testigo de metadatos nativo. Las
historias sintéticas se eliminan con el perfil; esto no acredita no-retención
del perfil persistente. Es una verificación opcional local, no ejecutada por
CI ni prueba de permisos, consentimiento, proveedores o campaña reales.

Verificación local del 2 de octubre de 2026: el ensayo completo terminó con
cuatro ejecuciones nativas de trigger (dos flujos, antes/después del reinicio),
cinco consultas y cuatro envíos ficticios por variante. El contacto marcado
con oposición no llegó al sender; el reinicio no generó
ningún efecto adicional. Las tres pruebas offline del runner rechazan helpers
cambiados/incompletos y comprueban que la extracción no ejecuta el acceso a
configuración privada ni importa el helper de chat.
