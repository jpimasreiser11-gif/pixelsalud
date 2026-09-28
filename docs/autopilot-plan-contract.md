# Varino Autopilot: plan contract v1

## Estado

Este módulo valida propuestas de automatización; no es un motor de ejecución.
La Pages Function `GET/POST /api/automations` puede guardar un plan validado
como borrador D1 dentro del único workspace activo de la sesión. No crea una
aprobación, no conecta cuentas, no llama a n8n y no ejecuta acciones.
`executable: false` se fuerza en todas las respuestas.

El planificador de desarrollo `POST /api/autopilot/plan` usa Ollama/Qwen solo
desde el servidor Astro local. Está disponible exclusivamente en `astro dev`,
rechaza datos personales, limita tamaño y frecuencia, valida cada propuesta
contra este contrato y devuelve `persisted: false` y `executable: false`. No
forma parte de la salida estática ni debe conectarse desde la web pública. La
pantalla `/app/` guarda un borrador manual mínimo mediante `/api/automations`
solo cuando se ejecuta con Pages Functions, sesión y D1 configuradas.

## Contrato

`src/lib/autopilot/plan-contract.mjs` acepta objetos estrictos versionados con
un disparador manual, programado o de correo, integraciones declaradas y hasta
12 pasos de una lista cerrada. Las integraciones representan requisitos del
plan; no significan que estén disponibles o conectadas. `/api/automations`
requiere una sesión, exactamente un workspace activo, JSON de hasta 8 KiB, una
clave de idempotencia y respeta un máximo de 15 intentos de escritura por
usuario y minuto. Persiste hashes de idempotencia, una versión y un evento de
auditoría en un lote D1. El servidor deriva riesgo y aprobación mínima; no
acepta esos valores desde la IA. Los patrones conocidos de datos privados se
rechazan antes de persistir.

La lista está limitada al workspace de la sesión y a 100 borradores. Lectores
pueden consultar; solo OWNER/ADMIN/MEMBER pueden crear. Aún no hay API para
borrar/exportar borradores ni política automática de retención. No introducir
datos de clientes ni abrir el servicio a usuarios externos hasta resolver esos
controles.

Se rechazan propiedades desconocidas, código, comandos, SQL y acciones fuera de
la lista. Cada integración necesaria debe aparecer en `requiredIntegrations`.
Los identificadores de pasos deben ser únicos y las zonas horarias se validan.

## Riesgo mínimo derivado

| Acciones del plan | Riesgo mínimo | Revisión humana |
| --- | --- | --- |
| Resumir, clasificar, extraer | Bajo | No requerida por este contrato |
| Crear un borrador en Gmail o crear/actualizar registros | Medio | Requerida |
| Enviar correo | Alto | Requerida |

La IA no puede declarar ni rebajar el nivel de riesgo. La política se deriva
del tipo de acción validado. Incluso un plan de riesgo bajo solo produce una
previsualización; este módulo nunca lo ejecuta.

## Siguiente orden de trabajo

1. Completar pruebas del guardado D1 y el navegador contra el mismo runtime
   local, además de revisar el diff y los límites de seguridad.
2. Diseñar e implementar exportación, borrado y retención antes de tratar datos
   reales o admitir usuarios externos.
3. Preparar un runtime Pages Functions + D1 de staging separado del hosting
   estático actual en GitHub Pages; aún no existe ni se ha desplegado.
4. Probar una integración de solo lectura con mínimo privilegio, trazas y
   límites, tras configurar autorización y consentimiento específicos.
5. Mantener toda escritura, envío, cobro y activación detrás de aprobación
   humana y probar el ciclo completo en staging antes de mostrarlo como activo.

No activar n8n ni habilitar pagos, envíos o cuentas de clientes como parte de
este contrato.
