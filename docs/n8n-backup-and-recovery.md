# Copias y comprobación de recuperación de n8n

`scripts/n8n-snapshot.py` crea una copia consistente de la SQLite mientras n8n
sigue en marcha. Incluye los cambios confirmados que aún están en WAL y convierte
solo la copia a modo de diario `DELETE`, para que sea un archivo independiente.
Conserva la configuración de cifrado y los archivos de `binaryData`, si existen.

La copia contiene material confidencial, incluida la clave de cifrado de n8n.
La carpeta se crea con modo `0700` y los archivos con `0600`. No añadir snapshots,
logs de operaciones, SQLite ni configuración de n8n al repositorio público.

## Uso

Indica la carpeta real `.n8n` y un destino privado separado del perfil:

```sh
python3 scripts/n8n-snapshot.py backup \
  --profile /ruta/privada/perfil/.n8n \
  --destination /ruta/privada/copias \
  --verify-runtime \
  --n8n-cli /ruta/al/ejecutable/n8n
```

Cada ejecución crea una carpeta nueva. `manifest.json` registra hashes,
integridad SQLite, recuentos y una huella de los workflows; no incluye sus
contenidos ni valores de credenciales. `.incomplete` identifica una copia que
no llegó a verificarse. El comando termina con código distinto de cero ante
un fallo y solo muestra códigos de error seguros.

Para repetir el ensayo sobre una copia existente:

```sh
python3 scripts/n8n-snapshot.py verify \
  --snapshot /ruta/privada/copias/una-copia-concreta \
  --verify-runtime \
  --n8n-cli /ruta/al/ejecutable/n8n
```

La verificación comprueba los hashes y crea un perfil temporal independiente.
El CLI de n8n abre esa copia y exporta sus workflows. Se comparan IDs, nombres,
estado, nodos, conexiones, ajustes y descripciones, además de los recuentos de
credenciales y ejecuciones. El ensayo no ejecuta, activa o publica workflows ni
exporta credenciales descifradas. Usa SQLite y un entorno mínimo, sin heredar
variables de conexión a otras bases. El perfil temporal se elimina al terminar.

## Operación

Puede ejecutarse desde un servicio local programado. En macOS, el servicio de
VARINO está configurado para las 04:30, en la zona horaria del sistema, y al cargar
la sesión. Usa `RunAtLoad`, proceso de fondo, máscara `077` y logs privados. Un
servicio de copia independiente permite comprobar también los fallos de n8n.

No hay purga automática. Revisar espacio y retención de las copias antes de
eliminarlas. La herramienta rechaza destinos generales, enlaces simbólicos y
perfiles con paquetes comunitarios que necesitan un plan de recuperación propio.
Si los archivos binarios cambian durante la copia, se conserva como incompleta.

Una copia en el mismo disco cubre recuperación de estado, no pérdida o avería
del equipo. Configurar después una segunda copia cifrada en un destino externo
aprobado. La comprobación del CLI tampoco demuestra funcionamiento de OAuth,
correo, CRM, pagos o de todas las integraciones: estos deben probarse por separado.
Con cero credenciales guardadas no se acredita una prueba de descifrado.

## Validación

`npm run test:n8n-backup` usa fixtures sintéticas y comprueba WAL pendiente,
permisos, integridad de configuración/binarios, rechazo de enlaces y rechazo de
paquetes comunitarios sin plan de recuperación. CI repite esa prueba sin acceder
a ninguna instancia n8n real. El ensayo `--verify-runtime` requiere el CLI local
instalado y un snapshot privado; no se hace contra datos reales desde CI.
