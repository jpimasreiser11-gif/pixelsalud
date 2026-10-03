# Dependencia de caché: hallazgo abierto

El 3 de octubre de 2026 `npm audit --omit=dev` pasó a devolver dos alertas
altas: `http-cache-semantics@4.2.0` y su consumidor directo Astro 7.2.10. La
[ficha oficial GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
se actualizó el 2 de octubre; en la consulta del día 3 indica versiones
afectadas hasta 4.2.0 y ningún parche publicado. El caso comunicado combina
una caché compartida, respuestas sensibles y la aceptación de `max-stale`.

## Evidencia local

- `npm ls http-cache-semantics`: única ruta del árbol de producción a través
  de Astro. La alerta no desaparece al reconstruir.
- Astro la importa en `dist/assets/build/remote.js` para TTL/revalidación de
  imágenes remotas. El archivo usa `storable()` y `timeToLive()`; no utiliza el
  método de aceptación de petición `satisfiesWithoutRevalidation()` del caso
  comunicado. Esto limita el alcance observado, no elimina el aviso de paquete.
- La build actual es estática: 40 rutas/41 HTML. No se encontraron imports de
  `astro:assets`, `Image`/`Picture` ni inferencia de imágenes remotas en el código
  de la web. Las llamadas de negocio están en Functions, no en un servidor Astro.
- La búsqueda del paquete y su implementación de aceptación de stale en
  Functions y artefactos locales no encontró coincidencias. Es una inspección
  de esta build, no una auditoría del despliegue público o de todo el Mac/n8n.

## Decisión vigente

Hallazgo **abierto**. No hacer `npm audit fix --force`: el resultado propuesto
es un downgrade incompatible a Astro 2.10.9, no una prueba de resolución.
No mover dependencias, quitar el audit, introducir excepciones silenciosas ni
llamar al repositorio “sin vulnerabilidades”. La CI conserva el audit bloqueante;
el éxito de la CI del commit anterior no acredita el commit nuevo.

Antes de publicar: revisar la respuesta del mantenedor, comprobar una versión
corregida o una eliminación/mitigación reproducible, verificar licencia y origen
si se necesita una sustitución, añadir regresión del comportamiento de caché y
repetir instalación limpia, audit, build, runtime y navegador. No se ha cambiado
la dependencia, aceptado el riesgo ni publicado una nueva web en este bloque.
