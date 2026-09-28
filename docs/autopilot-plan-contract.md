# Varino Autopilot: plan contract v1

## Estado

Este módulo valida propuestas de automatización. No es una aplicación SaaS ni
un motor de ejecución: no guarda planes, no autentica usuarios, no conecta
cuentas, no llama a n8n y no ejecuta acciones. `executable: false` es deliberado
hasta que exista una API autenticada y un ejecutor con aislamiento y auditoría.

## Contrato

`src/lib/autopilot/plan-contract.mjs` acepta objetos estrictos versionados con
un disparador manual, programado o de correo, integraciones declaradas y hasta
12 pasos de una lista cerrada. Las integraciones representan requisitos del
plan; no significan que estén disponibles o conectadas.

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

1. Resolver la deriva de seguridad del sitio publicado y revisar la PR #13.
2. Elegir y documentar el runtime dinámico, almacenamiento y modelo de
   autenticación; GitHub Pages solo sirve la web estática actual.
3. Añadir persistencia y aislamiento por workspace con migraciones y pruebas de
   acceso cruzado.
4. Construir un ejecutor de una sola integración de solo lectura, con límites,
   idempotencia, registro de eventos y aprobación antes de cualquier escritura.
5. Probar el flujo completo en staging antes de mostrar funciones activas.

No activar n8n ni habilitar pagos, envíos o cuentas de clientes como parte de
este contrato.
