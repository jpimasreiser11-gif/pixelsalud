# Regeneración obligatoria del control de bajas

## Resultado y límites

Los generadores privados de nurture y seguimiento ahora pasan por
`automation/n8n/durable_mail_builder.py`: cada regeneración incluye el guard
durable, conserva IDs, notas y referencias del gestor, sin duplicarlo. No
importa, activa, crea credenciales ni envía correos. La salida debe provenir del
builder revisado anterior al guard, no de un grafo arbitrario ya protegido.

El 3 de octubre de 2026 se instaló esta transformación en el emisor canónico
`wfkit.emit_workflow` y en el capturador de la herramienta de sincronización.
Los dos grafos del n8n persistente se actualizaron mediante la CLI nativa con
`--activeState=false`, después de snapshot y ensayo de restauración verificados.
No se cambió el propietario ni la credencial Google cifrada; los otros 16
grafos permanecieron idénticos. Verificación directa: 18 flujos, 203/203 notas,
cero flujos activos y cero historias/payloads. La apertura en Chrome mostró
los cuatro nodos nuevos y la ruta de oposición por cada variante.

Esto es instalación **inactiva**, no servicio comercial funcional: faltan
acceso Google comprobado, Gmail/Telegram, identidad legal, consentimiento
verificable, endpoint durable desplegado y credencial de consulta. Nunca usar
Sheets como fallback ante error/404/503 del ledger. No se enviaron mensajes a
personas ni se publicó la web.

## Contrato de regeneración

- Misma identidad de workflow. IDs existentes y referencias del gestor se
  conservan; nodos nuevos reciben IDs deterministas por workflow/nombre.
- Notas, visibilidad de notas, descripción y etiquetas existentes se preservan.
  La anotación del remitente se agrega solo al instalar el guard por primera vez.
- Cuatro nodos completos; guard modificado/incompleto, rutas alternativas,
  nodos eliminados, IDs duplicados y valores de credenciales abortan.
- El guard previo se compara con código, parámetros, settings y conexiones
  revisados. `disabled`, `executeOnce`, `alwaysOutputData` y `continueOnFail`
  no pueden desactivar o saltar los controles.
- Ambos permisos caducan; destinatario único y mismo RFC822. Se mantienen el
  consentimiento, testigo local, reserva, relecturas y ramas de revisión previas.
- El emisor canónico escribe en un archivo temporal 0600, sincroniza y sustituye
  el export solo después de validar. Ante error no sobrescribe el anterior.

## Preparación sin sobrescribir

    python3 automation/n8n/durable_mail_builder.py --generated BASE_REVISADA --previous EXPORT_ANTERIOR --output ARCHIVO_NUEVO_PRIVADO --kind nurture

Para seguimiento: `--kind followup`. La CLI pública exige un destino nuevo 0600;
no instala la transformación privada ni modifica el runtime por sí misma.

Las copias instaladas de `durable_mail_builder.py` y
`add-durable-mail-gate.py` deben coincidir byte a byte con las revisadas del
repositorio. La herramienta de documentación usa las mismas notas del guard y
contempla el diagnóstico de Sheets; ejecutarla en preview/check antes de importar.
Las notas nuevas deben pasar sus límites y no describir conexiones pendientes
como activas. Conservar una copia privada del código y exports anteriores.

## Pruebas y alcance

    npm run test:mail-durable-contract
    npm run test:mail-durable-regeneration -- --ops-dir OPERACIONES_PRIVADAS
    npm run test:mail-durable-native
    npm run test:mail-durable-complete -- --ops-dir OPERACIONES_PRIVADAS

El contrato offline de CI incluye siete pruebas de regeneración y tres de
seguridad del runner, además de los contratos previos. No usa cuentas ni red.
El runner opcional comprueba hashes revisados, instala un módulo de configuración
**ficticia** y extrae solo schemas literales por AST, sin ejecutar el módulo que
abre el archivo privado de configuración. Usa los dos builders reales, el emisor
atómico real y el capturador real, en un directorio temporal. Cada builder se
ejecuta dos veces, exige salida estable, verifica IDs/notas/referencias y
rechaza un guard alterado sin escribir. No ejecuta n8n ni transportes.

El ensayo completo opcional valida que el guard existe en el export canónico
antes de redirigir transportes a fixtures loopback. No vuelve a inyectarlo para
encubrir su ausencia. Ejercita programación, pairing, reserva, cuatro envíos
ficticios, una oposición bloqueada por variante y reinicio sin nuevos efectos.
Los historiales de ese fixture se eliminan con su perfil; no acreditan la
retención del perfil real, que se verificó separadamente tras la importación.

Los ensayos anteriores no prueban OAuth, recepción, respuesta de personas,
consentimiento, disponibilidad continua ni ausencia total de riesgo. La suite
de web construye 40 rutas y sus pruebas unitarias pasan, pero el audit de
dependencias del 3 de octubre falla por un aviso nuevo: ver
[registro de seguridad](security-dependency-2026-10-03.md). No fusionar ni
desplegar basándose en una CI anterior o en estos ensayos locales.
