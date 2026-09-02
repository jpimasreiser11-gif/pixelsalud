# VARINO Scroll World — QA gate

## Story and claims

- [ ] Cada escena comunica una sola idea.
- [ ] Ninguna escena parece un cliente, oficina o resultado real.
- [ ] No aparecen cifras, dashboards o testimonios inventados.
- [ ] Los textos comerciales permanecen en HTML.
- [ ] Los precios se identifican como orientativos.

## Visual continuity

- [ ] Mismo modelo, preámbulo, paleta, lente, luz y materiales.
- [ ] Último fotograma real de N = fotograma inicial de N+1.
- [ ] La cámara no invierte velocidad en ninguna unión.
- [ ] El último segundo de cada clip mantiene avance suave.
- [ ] No hay cambios de grano, exposición o color entre clips.
- [ ] Las uniones funcionan también al hacer scroll hacia arriba.

## Desktop

- [ ] 16:9 nativo; no escalado artificial.
- [ ] Póster visible antes del primer frame.
- [ ] `video.seekable.end(0) > 0`.
- [ ] Scroll rápido no congela el vídeo.
- [ ] Copy y CTA no tapan el sujeto.
- [ ] Navegación convencional sigue disponible.

## Mobile

- [ ] Cadena nativa 9:16, no crop de 16:9.
- [ ] Póster vertical coincide con el primer frame vertical.
- [ ] iOS Safari probado en dispositivo o emulación fiable.
- [ ] Android/Chrome probado con CPU 4–6× ralentizada.
- [ ] Colapsar barra del navegador no provoca saltos de altura.
- [ ] Girar el dispositivo recompone la interfaz.
- [ ] Texto y CTA respetan safe areas.

## Accessibility

- [ ] `prefers-reduced-motion` muestra pósteres estáticos.
- [ ] No existe audio ni reproducción sonora automática.
- [ ] Todo contenido está disponible en el DOM.
- [ ] Orden de lectura y foco coincide con la historia.
- [ ] Contraste WCAG AA en ambos temas.
- [ ] Teclado permite acceder a todos los CTA.
- [ ] El vídeo es decorativo y no duplica anuncios de lector de pantalla.

## Performance

- [ ] Solo se precargan clip actual y siguiente.
- [ ] Máster de escritorio no se descarga en móvil.
- [ ] `Save-Data` activa experiencia Lite.
- [ ] Blob URLs anteriores se liberan.
- [ ] No hay layout shift al cambiar póster por vídeo.
- [ ] La portada es utilizable antes de que termine la carga de vídeo.
- [ ] Se documenta peso total, por clip y primera descarga.

## Legal and release

- [ ] Proveniencia, modelo y licencia por asset.
- [ ] Sin marcas, rostros o material de terceros no autorizado.
- [ ] Revisión de privacidad/cookies después de instrumentación analítica.
- [ ] Seguridad y CSP revisadas para las nuevas fuentes multimedia.
- [ ] Aprobación humana final registrada.
- [ ] `SITE.launchReady` permanece `false` hasta completar todos los gates.
