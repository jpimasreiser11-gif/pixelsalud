# Autopilot — fase 1: núcleo D1

Estado: esquema preparado y probado únicamente en almacenamiento local temporal.
No está conectado a la web publicada ni contiene datos de clientes.

## Entregado

- Migración versionada para usuarios, workspaces, miembros con roles, sesiones
  con hash del token, automatizaciones, versiones, aprobaciones, ejecuciones y
  eventos de auditoría.
- Claves foráneas compuestas que obligan a asociar autores, aprobadores,
  versiones y ejecuciones al mismo workspace.
- La base impide dejar un workspace sin propietario activo e impide modificar o
  borrar eventos de auditoría.
- Una aprobación no puede marcarse como aceptada o rechazada sin guardar quién
  la resolvió.
- Idempotencia única por workspace, validación JSON en la base y límites de
  estado/reintentos mediante `CHECK`. El modo `autopilot` no se habilita en el
  esquema hasta que existan el ejecutor y sus límites.
- Configuración Wrangler con un ID marcador solo para desarrollo local y
  directorio de persistencia ignorado por Git.
- `npm run test:d1` crea una base D1 temporal, aplica la migración, verifica un
  flujo válido, intenta escrituras entre tenants y duplicadas, comprueba
  propietario activo, inmutabilidad de auditoría y
  `pragma_foreign_key_check`, y elimina solo el directorio temporal que creó.

## Límites actuales

- No hay Pages Functions, login, API de workspace ni frontend SaaS.
- El D1 remoto no existe/no se ha enlazado; ningún comando remoto se ha usado.
- La tabla `sessions` no implica que haya autenticación implementada.
- No hay credenciales OAuth, ejecución de workflow, tareas programadas ni
  acceso a Gmail/Drive/Calendar/Sheets.
- El despliegue existente sigue siendo GitHub Pages y continúa sirviendo el
  sitio estático. La configuración Wrangler no cambia DNS, hosting ni la
  publicación.

GitHub describe Pages como hosting estático. Cloudflare documenta Pages
Functions y bindings D1, incluida la ejecución local; por eso se usa como
entorno de desarrollo candidato, no como un cambio de producción:
[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages),
[Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/),
[bindings D1](https://developers.cloudflare.com/pages/functions/bindings/) y
[desarrollo local](https://developers.cloudflare.com/pages/functions/local-development/).

## Restricción de n8n para el modelo SaaS

La guía oficial de n8n distingue consultoría sobre la instancia del cliente,
hosting de workflows/credenciales de clientes y n8n incrustado en un producto.
Indica que alojar los workflows y credenciales de clientes requiere una
licencia Enterprise, y que exponer workflows/credenciales desde un producto
requiere una licencia Embed. Hasta tener confirmación escrita y un presupuesto
aprobado, n8n no será el motor multi-cliente de Autopilot. La instancia local
puede seguir utilizándose para procesos internos y pruebas aisladas.
[Guía oficial de licencias de n8n](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case).

## Siguiente bloque

Implementar autenticación y sesión segura, vinculadas a `users` y `workspaces`,
con pruebas de login, revocación y aislamiento. Antes de conectar staging hacen
falta un proveedor de identidad configurado y un runtime de preview; los
secretos no se guardarán en Git ni en el cliente.
