# Baja: motor n8n verificado, enlace público todavía pendiente

## Alcance real del bloque

El flujo 3 deja de ser un no-op y pasa a ser un **motor interno de supresión**.
Está preparado para que una cola autenticada registre una baja ya confirmada en
el CRM. No es aún el enlace público que aparece en los emails. No activar
marketing hasta completar los requisitos del apartado final.

Fuente versionada: `automation/n8n/build-unsubscribe.py`; plantilla sin IDs de
cuentas: `automation/n8n/3-unsubscribe.template.json`. La plantilla está inactiva
y solo contiene referencias placeholder a gestores de credenciales de n8n.
No incluye contactos, secretos, direcciones de túneles ni credenciales OAuth.

## Contrato y efectos

- Un POST por evento a `/webhook/unsub-sync`, protegido por **Header Auth** de
  n8n. La credencial debe usar una clave distinta de las de leads y documentos.
  Su nombre de cabecera es `x-varino-unsub-key`; el valor solo se introduce en el
  gestor de credenciales, nunca en el navegador, URL, código o documentación.
- El worker aporta exactamente `email`, `eventId` (64 caracteres hexadecimales
  opacos) y `requestedAt` (UTC ISO real). No se admiten campos extra, saltos de
  línea ni una fecha futura. Un evento validado **no acredita un opt-in**.
- Lee y valida la tabla canónica `Supresion` antes de escribir. Las direcciones
  se normalizan sin reglas específicas de proveedor (no quitar puntos ni `+`).
- Una baja anterior del mismo email prevalece, aunque tenga otro motivo o ID.
  No elimina la evidencia ni vuelve a activar permisos del contacto.
- Si no existía, añade seis campos mínimos mediante `valueInputOption=RAW`,
  sin reintento automático del append ni modificación completa de Leads.
- Relee la tabla después de escribir, incluso si se perdió la respuesta. Solo
  confirma una baja observada en un esquema válido. Si falta esa evidencia,
  responde 503, no éxito ficticio. El siguiente intento empieza consultando el
  efecto anterior y no vuelve a añadir una baja ya registrada.
- Responde únicamente estado e ID opaco. No envía Gmail/Telegram, no crea
  consentimiento, no concede accesos ni firma documentos.

Los flujos de nurture/seguimiento actuales consultan `Supresion` al seleccionar
contactos y de nuevo antes de Gmail. Una entrada en esa tabla bloquea envíos
independientemente de un checkbox histórico. **No** existe exclusión distribuida
entre varias instancias ni garantía de retirar un email que Gmail ya aceptó.

## Configuración e instalación local

Generar un export con el ID real del CRM, en un directorio privado:

```sh
python3 automation/n8n/build-unsubscribe.py --sheet-id ID_REAL_DE_LA_HOJA --output RUTA_PRIVADA/3-unsub.json
```

Antes de sustituir el flujo, crear y verificar snapshot del perfil dedicado;
comprobar que el ID coincide y que el staging sigue sin ejecuciones ni flujos
activos. Importar solo ese export con `--activeState=false`, verificar la copia
persistida y reiniciar el servicio local. No crear ni vincular credenciales como
parte del import. El perfil compartido `~/.n8n` no es el perfil dedicado.

**Privacidad del historial:** no basta comprobar una respuesta HTTP ni el ajuste
del workflow. En la versión local n8n 2.40, el código instalado de
`ExecutionPersistence.deleteInFlightExecution` difiere entre pruning activo
(borrado lógico diferido) y pruning inactivo (borrado inmediato). El ensayo usa
un perfil dedicado sin historial con:

```text
EXECUTIONS_DATA_PRUNE=false
EXECUTIONS_DATA_SAVE_ON_ERROR=none
EXECUTIONS_DATA_SAVE_ON_SUCCESS=none
EXECUTIONS_DATA_SAVE_ON_PROGRESS=false
EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=false
```

Junto con los mismos ajustes `none`/`false` en **todos** los workflows, se verifica
en SQLite que las ejecuciones terminadas no retienen payloads. No extrapolar a
otra versión. Si se decide conservar historial para diagnóstico, revisar una
política de retención/redacción distinta: desactivar pruning con guardado activo
podría producir retención indefinida. No hacerlo.

## Pruebas reproducibles

```sh
npm run test:unsubscribe-workflow
npm run test:unsubscribe-native
```

La primera ejecuta seis regresiones de contrato/grafo y comprueba que la
plantilla coincide exactamente con el generador. La segunda usa el n8n instalado
en un perfil **temporal** en loopback, con credenciales efímeras y transporte
Sheets ficticio. Conserva Code, IF, conexiones y respuestas reales. Comprueba:
auth, payload inválido, duplicados, normalización, esquema/lecturas/escritura
fallidas, append efectuado con respuesta perdida, confirmación perdida seguida
de reintento, ausencia de ruta GET y limpieza efectiva de payloads de ejecución.
El perfil y las credenciales ficticias se eliminan al acabar. No se llama a
Google, no se envían correos ni se activa el perfil persistente.

El contrato offline forma parte de CI. El ensayo n8n nativo es local y explícito;
no confundir ambos ni interpretar una CI verde como integración OAuth real.

## Pendientes para la baja pública y marketing

1. Emitir tokens aleatorios/firmados con alta entropía y guardar solo su hash;
   nunca codificar reversiblemente el email en una URL.
2. GET de confirmación sin efectos: visitas de escáneres no deben dar de baja.
   POST con confirmación y validación de origen; página accesible sin cuenta.
3. Guardar la oposición **durablemente antes** de informar éxito. Cola/outbox
   con reanudación tras reinicio y errores de CRM; la supresión durable debe
   consultarse antes de cualquier envío mientras aún no se sincronizó Sheets.
4. Conectar el worker a este motor con secreto en un gestor y comprobar el efecto
   en una hoja real de prueba, con autorización y cuentas adecuadas.
5. Integrar el enlace en todas las plantillas; comprobar la baja desde un correo
   real autorizado. No anunciar List-Unsubscribe-Post/RFC 8058 sin una ruta de
   un clic específica compatible y verificada.
6. Verificar propiedad del email/consentimiento comercial, identidad del operador
   y revisión legal. No asumir que un email publicado autoriza promociones.

Este bloque no demuestra lanzamiento, consentimiento real ni cumplimiento legal
completo. Los gates existentes de OAuth, lanzamiento y marketing permanecen.
