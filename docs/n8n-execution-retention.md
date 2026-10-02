# Retención de ejecuciones y limpieza nativa de n8n

`saveManualExecutions: false` no demuestra eliminación inmediata. En la versión
local verificada (n8n 2.40.7), el hook manual hace soft delete; el temporizador
nativo se encarga después de eliminar la ejecución y su payload. Si
`EXECUTIONS_DATA_PRUNE=false`, ese historial puede permanecer. No usar un workflow
de negocio que borre directamente tablas internas de n8n.

## Prueba real reproducible, sin tocar la instancia operativa

```sh
npm run test:n8n-pruning-contract
npm run test:n8n-pruning-native
```

El segundo comando requiere el CLI local instalado. No acepta `--profile`. Crea
un perfil privado temporal, un único workflow inactivo con Manual Trigger y Set,
una credencial ficticia sin utilizar y dos ejecuciones CLI nativas con un marcador
sintético. Solo para preparar el caso, estando el servicio detenido, marca una de
esas ejecuciones como manual/running/soft-deleted dos horas antes. Es una
simulación explícita de metadatos del hook, no una prueba del hook de la UI.

Con el servicio nativo arrancado observa cuatro fases:

1. Pruning desactivado: permanecen ambas ejecuciones y ambos payloads.
2. Pruning activado con buffer de tres horas: el soft delete de dos horas sigue
   protegido; se conservan ambas ejecuciones.
3. Pruning activado con buffer cero: desaparece solo la ejecución soft-deleted y
   su payload. La ejecución reciente no marcada para borrado permanece.
4. Reinicio con la misma política: permanece esa ejecución, sin borrados extra.

Se verifica integridad SQLite, contenido de los workflows y ciphertext de la
credencial sin descifrarlo. El temporizador de la prueba está acelerado a 0.05
minutos; no se recomienda ese intervalo para producción. Procesos, perfil,
import de credencial ficticia y logs se eliminan al terminar. El ensayo nativo del
2 de octubre de 2026 pasó las cuatro fases en n8n 2.40.7; CI ejecuta únicamente
los contratos offline, no una instancia n8n ni credenciales reales.

## Política operativa y recuperación

Para workflows que no deben guardar ejecuciones, conservar los cuatro ajustes
no-save globales y específicos de workflow. La limpieza es diferida, no una
garantía de cero datos en disco en todo momento. Una política propuesta de
limpieza frecuente es `EXECUTIONS_DATA_PRUNE=true`,
`EXECUTIONS_DATA_HARD_DELETE_BUFFER=0` y
`EXECUTIONS_DATA_PRUNE_HARD_DELETE_INTERVAL=1` (un minuto). El primer borrado se
programa después de arrancar; no ocurre inmediatamente al leer la configuración.
Las ejecuciones no soft-deleted siguen sujetas a la política de edad/recuento;
no cambiar esos límites silenciosamente.

Antes de aplicarla a un perfil real:

- Crear y comprobar una copia recuperable con
  [el procedimiento de backup](n8n-backup-and-recovery.md). Mantenerla privada.
- Inventariar, sin leer payloads, IDs, workflow, modo, estado y `deletedAt` de las
  filas que serían elegibles. Confirmar que pertenecen al diagnóstico propio y
  que no hay workflows/ejecuciones ni un consentimiento OAuth en curso.
- Guardar una copia privada de la configuración del servicio. No modificar
  tokens, claves de cifrado, credenciales ni la base con DELETE SQL.
- Aplicar la política en el supervisor, reiniciar una sola instancia y comprobar
  readiness y limpieza real después del temporizador nativo. Comparar entidades
  **y** `execution_data`; un contador de workflows no verifica privacidad.
- Comprobar que workflows, credenciales cifradas e integridad no cambian.
  Documentar qué se eliminó y la ubicación privada de la copia recuperable.
- Si falla la comprobación, no activar flujos comerciales. Volver a la
  configuración anterior y diagnosticar; no restaurar un snapshot sobre cambios
  posteriores del usuario sin revisar el conflicto.

## Aplicación local comprobada, 2 de octubre de 2026

Tras verificar un snapshot y su restauración nativa, se aplicó esta política al
LaunchAgent de la instancia local dedicada. El servicio se reinició y mostró
readiness correcta. La limpieza nativa eliminó únicamente los tres historiales
soft-deleted del diagnóstico propio. Quedaron 18 workflows, cero activos, una
credencial cifrada sin cambios, cero `execution_entity`, cero `execution_data` e
integridad SQLite correcta. El verificador de exports confirmó las 195 notas de
nodo y los 18 workflows exactos; no se rebajó su criterio de privacidad.

Se ejecutó una vez el diagnóstico manual existente desde Chrome, sin activar ni
publicar workflows. La respuesta de n8n identificó la ejecución 4; sus cuatro
nodos finalizaron y la UI mostró el resultado de solo lectura. Después se
comprobó de nuevo cero entidades y payloads, sin DELETE SQL sobre el perfil real.
La ejecución manual no quedó como historial residual. Se mantuvo la credencial y
se devolvió la pestaña al propietario.

Los dos GET reales a Google siguieron devolviendo 403. No hubo lectura de filas
de contactos, escrituras ni correos. La evidencia de limpieza **no** acredita
acceso al CRM, descifrado de credenciales, Gmail, Telegram o campañas; hace falta
completar esa autorización y probar cada integración antes de habilitarla. El
snapshot y el registro detallado permanecen privados; los historiales anteriores
pueden recuperarse desde esa copia. La limpieza es diferida, no una promesa de
ausencia absoluta de datos en disco durante cualquier ejecución o en backups.
