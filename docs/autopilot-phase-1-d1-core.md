# Autopilot — fase 1: núcleo D1

Estado: núcleo D1 y primera API de identidad/workspace implementados para
ejecución local. No está conectado a la web publicada ni contiene datos de
clientes.

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
- La migración `0002_google_identity.sql` asocia el usuario a un `sub` OIDC
  estable y único. Los handlers de Pages Functions implementan login Google,
  sesión opaca con solo el hash en D1, revocación y creación del primer
  workspace con rol `OWNER`; su detalle está en
  [`autopilot-phase-1-auth.md`](./autopilot-phase-1-auth.md).
- La migración `0003_automation_draft_safety.sql` añade hashes de clave y
  contenido para idempotencia y una cuota D1 de 15 intentos de borrador por
  usuario/minuto. `POST /api/automations` valida el contrato, bloquea patrones
  conocidos de datos privados, deriva riesgo en servidor y guarda borrador,
  versión y evento de auditoría en un lote. `GET` devuelve solo el workspace
  de la sesión. Ninguna ruta ejecuta el plan ni crea una aprobación.
- `/app/` ofrece un borrador manual de resumen, lista los borradores guardados
  y declara expresamente que no consulta cuentas ni ejecuta acciones.
- La prueba de runtime aislado comprueba sesión, roles, aislamiento entre
  tenants, origen, esquema estricto, PII, idempotencia, riesgo derivado, cuota,
  ausencia de ejecuciones e integridad D1.

## Límites actuales

- No hay credenciales OAuth, instancia D1 remota, despliegue de Pages Functions
  ni usuarios externos. La API y la pantalla `/app/` solo se pueden validar en
  el runtime local configurado.
- El D1 remoto no existe/no se ha enlazado; ningún comando remoto se ha usado.
- Sin secretos de Google, la autenticación falla cerrada; no existe un modo de
  login de demostración.
- No hay credenciales OAuth, ejecución de workflow, tareas programadas ni
  acceso a Gmail/Drive/Calendar/Sheets.
- No existe todavía borrado/exportación de borradores ni política automática
  de retención; la detección de PII es una defensa adicional, no autorización
  para almacenar datos reales o admitir clientes.
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

Antes de staging: completar revisión de seguridad del API, añadir exportación,
borrado y retención, y configurar un runtime de preview con D1 aislado. La
implementación de identidad y sesión ya está descrita en
[`autopilot-phase-1-auth.md`](./autopilot-phase-1-auth.md); aún no hay proveedor
configurado ni acceso en producción. Después, validar una integración de solo
lectura con permisos explícitos. Mantener envíos, escritura externa, n8n activo
y pagos deshabilitados mientras falten autorización y pruebas E2E.
