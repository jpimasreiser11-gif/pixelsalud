# VARINO Scroll World — production runbook

Este documento convierte la portada de VARINO en una experiencia cinematográfica controlada por scroll. No se ha iniciado ninguna generación de pago.

## Decisión creativa

- Arquitectura: recorrido continuo hacia delante (seis clips, sin conectores separados).
- Estética: arquitectura tecnológica premium, no diorama infantil.
- Escritorio: cadena nativa 16:9, 1080p final.
- Móvil: segunda cadena nativa 9:16; nunca recorte automático del máster horizontal.
- Sonido: ninguno. Todo el vídeo se publica sin pista de audio.
- Texto y botones: HTML accesible superpuesto, nunca texto generado dentro del vídeo.
- Movimiento reducido: pósteres estáticos, sin scrub.
- Estado: preproducción. Vídeo bloqueado hasta aprobar imágenes, proveedor y coste.

## Material preparado

- `PROMPTS.md`: preámbulo visual, prompts de las seis imágenes maestras y de los doce clips finales.
- `scenes.json`: contenido, orden, duración de scroll y CTA de cada escena.
- `QA.md`: controles visuales, técnicos, móviles, de accesibilidad y conversión.

## Herramientas disponibles en este Mac

- `ffmpeg`: disponible.
- `ffprobe`: disponible.
- Codex/ImageGen: disponible para imágenes maestras.
- Monid: no instalado.
- Higgsfield: no instalado.

La ausencia de Monid/Higgsfield no afecta al diseño. Impide únicamente renderizar los clips hasta que se seleccione y autorice un proveedor.

## Estructura final prevista

```text
public/media/scroll-world/
├── desktop/
│   ├── posters/01-friction.webp ... 06-varino.webp
│   └── video/01-friction.mp4 ... 06-varino.mp4
├── mobile/
│   ├── posters/01-friction.webp ... 06-varino.webp
│   └── video/01-friction.mp4 ... 06-varino.mp4
└── provenance.json
```

Los archivos no se crean hasta que sus imágenes y licencias estén aprobadas.

## Paso a paso de producción

### 1. Bloquear el lenguaje visual

1. Usar exactamente el `STYLE PREAMBLE` de `PROMPTS.md` en las seis imágenes.
2. No cambiar paleta, lente, materiales, grano, niebla o temperatura entre escenas.
3. Generar primero las seis imágenes de escritorio, sin vídeo.
4. Revisarlas juntas como una sola colección.
5. Regenerar cualquier imagen que parezca otro mundo, otro renderizador o una campaña diferente.

La continuidad visual se decide aquí. No se intenta arreglar una colección incoherente durante el vídeo.

### 2. Aprobar el storyboard comercial

Para cada escena verificar:

1. Se entiende el problema o servicio sin leer el texto.
2. La escena contiene una única idea focal.
3. El centro y el tercio izquierdo/derecho dejan espacio para el copy HTML.
4. No aparecen empresas, personas, pantallas, cifras o resultados ficticios.
5. El CTA corresponde con la escena y no aparece antes de comprender el valor.

### 3. Crear el previz económico

1. Elegir un único modelo de vídeo capaz de recibir imagen inicial.
2. Verificar su esquema actual antes de gastar.
3. Renderizar los seis clips a resolución de prueba.
4. Mantener el mismo modelo en toda la cadena.
5. Revisar cada último fotograma antes de iniciar el siguiente clip.
6. Repetir solamente los clips defectuosos.

No se pasa a 1080p hasta aprobar el recorrido completo.

### 4. Regla de continuidad obligatoria

El clip 01 comienza desde la imagen maestra 01. Los clips 02–06 no comienzan desde sus imágenes conceptuales: comienzan desde el último fotograma real del clip anterior.

```text
imagen maestra 01 → clip 01
último fotograma clip 01 → clip 02
último fotograma clip 02 → clip 03
último fotograma clip 03 → clip 04
último fotograma clip 04 → clip 05
último fotograma clip 05 → clip 06
```

Las imágenes maestras 02–06 son referencias de dirección artística y pósteres; no sustituyen el handoff real.

Extraer el último fotograma:

```bash
ffmpeg -sseof -0.04 -i input.mp4 -frames:v 1 -update 1 last-frame.png
```

Antes de continuar confirmar que el fotograma parece un avance lento y limpio hacia el siguiente espacio. Si termina orbitando, alejándose o con desenfoque fuerte, se vuelve a generar ese clip.

### 5. Render final de escritorio

- Aspecto: 16:9.
- Resolución de origen: 1080p nativa.
- Duración objetivo: 8 segundos por clip.
- Cámara: 24 fps, movimiento cinematográfico lento.
- Audio: desactivado.
- Un modelo para los seis clips.

Codificación web:

```bash
ffmpeg -i source.mp4 -an \
  -vf "unsharp=5:5:0.8:5:5:0.0" \
  -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
  -g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart output.mp4
```

No usar all-intra: multiplica el peso sin necesidad. El motor cargará cada clip como Blob para que sea seekable.

### 6. Cadena móvil nativa

1. Generar seis imágenes verticales con los prompts móviles.
2. Repetir desde cero la cadena de handoff en 9:16.
3. No usar los últimos fotogramas de escritorio como inicio móvil.
4. Mantener el sujeto dentro del 60 % central y reservar zonas superiores/inferiores para interfaz.
5. Codificar a 720 píxeles de ancho, GOP 4 y CRF 23.

```bash
ffmpeg -i source-mobile.mp4 -an \
  -vf "scale=720:-2,unsharp=5:5:0.6:5:5:0.0" \
  -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p \
  -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart output-mobile.mp4
```

### 7. Integración en Astro

1. Crear un componente `ScrollWorld.astro` que lea `scenes.json`.
2. Montar un `<video muted playsinline preload="metadata">` dentro de un contenedor `position: sticky; top: 0; height: 100svh`.
3. Crear una banda de scroll por clip; el valor recomendado se encuentra en `scenes.json`.
4. Mapear el progreso de scroll al `currentTime` del vídeo.
5. Coalescer seeks con `requestAnimationFrame`; nunca escribir `currentTime` en cada evento de scroll sin control.
6. Cargar el clip como Blob para garantizar `video.seekable` incluso si el hosting no sirve rangos correctamente.
7. Precargar solamente el clip actual y el siguiente.
8. Mostrar inmediatamente el póster; sustituirlo por vídeo cuando `readyState` permita pintar.
9. Superponer copy y CTA como HTML con contraste y foco accesibles.
10. Liberar Blob URLs de clips que hayan quedado suficientemente atrás.

### 8. Degradación elegante

- `prefers-reduced-motion: reduce`: no vídeo; seis pósteres con transición instantánea.
- `Save-Data`: pósteres y copy, sin descargar los másteres.
- fallo de vídeo: conservar póster y navegación normal.
- dispositivo lento: servir cadena móvil o modo Lite.
- JavaScript deshabilitado: contenido completo en flujo normal.

### 9. Conversión

- Escenas 1–2 educan; no muestran precio ni CTA agresivo.
- Escena 3 vende Automation Sprint.
- Escena 4 vende Sistema de crecimiento.
- Escena 5 vende IA privada.
- Escena 6 presenta mantenimiento y CTA principal.
- Los CTA aparecen cuando el movimiento se estabiliza, no durante una transición rápida.
- Cada CTA debe seguir funcionando sin vídeo y con teclado.

### 10. Publicación

No publicar hasta completar:

- procedencia/licencia de imágenes y vídeos;
- revisión manual de todas las uniones hacia delante y hacia atrás;
- versión móvil real;
- prueba de iOS Safari;
- presupuesto de peso y rendimiento;
- alternativa de movimiento reducido;
- revisión de claims, privacidad y textos legales;
- autorización explícita del titular.
