# VARINO Scroll World — prompt bible

Los prompts se redactan en inglés para reducir ambigüedad en los modelos visuales. Los titulares y CTA permanecen en español como HTML.

## 1. Reglas de ensamblaje

Cada imagen se genera concatenando, en este orden:

```text
STYLE PREAMBLE
DESKTOP FRAME o MOBILE FRAME
SCENE SUBJECT
NEGATIVE CLAUSE
```

El `STYLE PREAMBLE` debe ser idéntico, carácter por carácter, en las doce imágenes. No lo parafrasear entre escenas.

### STYLE PREAMBLE — copiar sin cambios

```text
Premium cinematic 3D architectural visualization for VARINO, a high-end automation and private AI studio. One coherent near-future operational world made of matte graphite architecture, smoked glass, satin black metal, translucent mineral-white surfaces and precise indigo light paths. Palette: deep night #0A0D14, graphite #111318, VARINO indigo #655CFF, mineral white #F7F7F5 and restrained electric blue #2997FF. Sophisticated, calm, credible and engineered; Apple-level product-film restraint without imitating any Apple product or interface. Physically based materials, ray-traced global illumination, subtle volumetric atmosphere, soft controlled reflections, realistic depth, clean negative space, extremely precise geometry, cinematic 35mm lens, subtle film grain. No humans, no robots, no fantasy characters. Every object belongs to the same continuous architectural complex.
```

### DESKTOP FRAME

```text
Wide landscape master composition, 3:2 still designed to transition into a 16:9 video. Primary subject inside the central 65 percent. Preserve generous clean negative space on both sides for accessible HTML copy. Clear forward passage or doorway visible in the depth of the scene, leading naturally toward the next space. Camera at human chest height, looking forward, stable horizon.
```

### MOBILE FRAME

```text
Native 9:16 portrait master composition, designed specifically for a phone and not cropped from landscape. Primary subject inside the central 55 percent. Preserve clear negative space in the upper 18 percent and lower 22 percent for accessible HTML copy and controls. Strong foreground, middle ground and deep forward passage. Camera at human chest height, looking forward, stable horizon.
```

### NEGATIVE CLAUSE — copiar sin cambios

```text
No text, no letters, no numbers, no logos, no watermarks, no dashboards with fake metrics, no terminal screens, no currency, no charts, no client brands, no office photography, no faces, no hands, no extra limbs, no cyberpunk neon overload, no blue hologram cliché, no childish toy look, no clutter, no fisheye, no Dutch angle, no motion blur, no depth-of-field blur on the main subject.
```

## 2. Imágenes maestras — escritorio y móvil

Para cada escena generar una vez con `DESKTOP FRAME` y otra con `MOBILE FRAME`. El `SCENE SUBJECT` es el mismo salvo las notas de composición móvil indicadas.

### 01 — Friction / trabajo disperso

```text
SCENE SUBJECT: A vast dark operational atrium before automation. Hundreds of restrained physical information objects — paper-like request cards, neutral email envelopes, calendar tiles, document blocks and disconnected task capsules — float along conflicting paths and accumulate at bottlenecks. Nothing is chaotic in a fantastical way; it feels like a real business process made architectural. Several paths terminate at closed graphite gates, while a faint indigo route is barely visible far ahead. The emotional read is friction, delay and lost context, not disaster. The forward destination is a narrow indigo-lit opening in the back wall.
```

Mobile composition note:

```text
Stack the information paths vertically with clear foreground layers; keep the indigo destination visible above the centre and leave the lower area quiet for copy.
```

### 02 — Understand / proceso visible

```text
SCENE SUBJECT: The camera has entered a clean process-mapping chamber. The previously scattered objects are now arranged into one elegant physical workflow suspended in space: input channel, validation junction, decision fork, visible exception lane, human-review gate represented by a calm illuminated threshold, and a recoverable final route. Thin indigo light traces every dependency. Components remain open and inspectable rather than hidden in a black box. A precise forward corridor continues through the completed map toward the next room.
```

Mobile composition note:

```text
Arrange the workflow as a vertical sequence rising through the frame, with the human-review threshold at visual centre and the forward corridor at the top third.
```

### 03 — Automation Sprint

```text
SCENE SUBJECT: A premium automated operations line built from smoked glass channels and matte graphite modules. One neutral request capsule enters, is validated, passes through a transparent rule engine, and either continues or moves visibly into an amber exception bay. A mineral-white manual recovery lever sits beside the exception bay, clearly reachable but untouched. The successful route exits as one clean confirmed record. Indigo energy moves only along active paths. The architecture communicates observability, bounded scope and recovery, not autonomous magic. The line continues forward into a wider commercial signal hall.
```

Mobile composition note:

```text
Use a strong bottom-to-top process line; exception bay on the right middle, recovery control on the left middle, confirmed output and next doorway in the upper third.
```

### 04 — Growth System

```text
SCENE SUBJECT: A spacious commercial signal hall where three restrained input channels converge: web request capsules, email envelopes and neutral conversation tokens. They enter a transparent qualification prism whose rules are visible as physical layers, then slow before a large mineral-white human approval gate. Only approved signals continue into an orderly circular CRM archive; rejected or incomplete signals remain visible in a review lane. No messages send themselves. Indigo light shows continuity from capture to review to record. A secure dark passage leads onward into a private knowledge vault.
```

Mobile composition note:

```text
Place the three inputs in the lower third, qualification at centre, human approval gate above centre and CRM archive in the upper third. Keep side edges quiet.
```

### 05 — Private AI

```text
SCENE SUBJECT: A secure private knowledge vault inside the same architectural complex. Source documents live in separate translucent chambers with distinct physical access rings. A neutral query sphere travels only through authorized indigo paths, retrieves a small set of source fragments and assembles a grounded answer object beside visible citations. One unauthorized chamber stays dark and closed. A second path ends safely at an abstention threshold marked only by form and amber light, with no invented answer. In the distance, the vault opens into an operations control room.
```

Mobile composition note:

```text
Use a cathedral-like vertical vault: query sphere low, authorized sources around centre, closed permission chamber to one side, cited answer and abstention threshold in the upper middle.
```

### 06 — VARINO / operación continua

```text
SCENE SUBJECT: The final VARINO operations chamber where the automation line, commercial signal route and private knowledge path converge without merging their permissions. A calm circular control architecture shows status through light states only: healthy indigo routes, one recoverable amber exception and a clear mineral-white human approval console. The architecture opens toward a monumental V-shaped graphite portal with one small floating indigo sphere, an abstract spatial echo of the VARINO mark rather than a printed logo. Beyond it is clean mineral light and open space. The feeling is control, capacity and readiness to act.
```

Mobile composition note:

```text
Converging systems rise from the bottom edges into the control ring at centre; the V-shaped portal and indigo sphere occupy the upper third, leaving lower safe space for the primary CTA.
```

## 3. Prompts de vídeo — contrato global

Añadir este contrato al principio de todos los clips:

```text
Single continuous cinematic shot, no cuts, no dissolves, no teleportation, no scene reset, no time jump. Preserve the exact VARINO world, palette, materials, lighting, geometry quality and realistic scale of the supplied first frame. No new text, symbols, logos, people or interfaces. Camera motion is slow, physically plausible and premium. Objects animate only when the process logic requires it. Avoid warping, melting, duplication, sudden object replacement, exposure pumping, focus breathing and speed ramps.
```

Para clips 02–05 añadir al final este handoff exacto:

```text
During the final one second, all expressive motion settles into the same slow, steady forward drift toward the next destination. The camera never reverses, pulls backward or changes direction across the handoff. End on a sharp, stable forward-moving frame with a clear passage ahead.
```

## 4. Vídeos de escritorio 16:9

### Clip 01 — entrar en la fricción

Inicio: imagen maestra 01.

```text
Begin with a restrained wide view of the operational atrium. Glide slowly forward between conflicting information paths, creating gentle foreground parallax. A few request cards wait at closed gates; no object flies toward the camera. Gradually align with the faint indigo route in the distance. As the camera approaches, disconnected paths begin to calm but do not yet reorganize. End by entering the narrow indigo-lit opening, maintaining a slow steady forward drift. 8 seconds, 16:9, 24 fps, cinematic 35mm, no audio.
```

### Clip 02 — revelar el mapa del proceso

Inicio: último fotograma real del clip 01.

```text
Continue the incoming forward drift through the indigo opening into the process-mapping chamber. Perform a very gentle crane rise while the scattered information objects slide into a visible sequence: input, validation, decision fork, exception lane and human-review threshold. Track laterally for a moment alongside the transparent workflow to create parallax, then pass the human-review threshold without triggering any external action. Aim toward the corridor beyond the completed map. 8 seconds, 16:9, 24 fps, no audio.
```

Añadir el handoff global.

### Clip 03 — Automation Sprint

Inicio: último fotograma real del clip 02.

```text
Continue forward into the bounded automation line. Track low and slightly lateral beside one neutral request capsule as it enters validation, passes through the transparent rule engine and reaches a decision point. Reveal one incomplete duplicate moving calmly into the amber exception bay while the valid capsule continues. Briefly frame the untouched mineral-white manual recovery control, then follow the confirmed record toward the exit. The process must feel observable and recoverable, never magical or fully autonomous. 8 seconds, 16:9, 24 fps, no audio.
```

Añadir el handoff global.

### Clip 04 — Sistema de crecimiento

Inicio: último fotograma real del clip 03.

```text
Continue the forward drift into the commercial signal hall. Three restrained channels converge around the camera with soft parallax. Follow one opportunity capsule through transparent qualification layers where visible rules organize its context. Slow beside the mineral-white human approval gate; the gate opens only after a subtle non-textual approval light activates. Continue with the approved capsule into the orderly CRM archive while an incomplete capsule remains visibly parked in review. Move toward the secure passage beyond. 8 seconds, 16:9, 24 fps, no audio.
```

Añadir el handoff global.

### Clip 05 — IA privada

Inicio: último fotograma real del clip 04.

```text
Continue into the private knowledge vault. Make a slow half-orbit around a neutral query sphere while it follows only authorized indigo paths. Several source fragments emerge from permitted chambers and assemble beside the query as a grounded answer object with abstract source markers, never readable text. An unauthorized chamber remains dark and closed. Briefly reveal a second uncertain query stopping safely at the amber abstention threshold. Ease out of the half-orbit and continue toward the operations chamber. 8 seconds, 16:9, 24 fps, no audio.
```

Añadir el handoff global.

### Clip 06 — convergencia y CTA

Inicio: último fotograma real del clip 05.

```text
Continue into the final operations chamber. The automation, commercial and private-knowledge light paths enter from separate protected routes and settle around the circular control architecture. Perform a slow premium half-orbit around the control ring, revealing one healthy indigo state, one recoverable amber exception and the mineral-white human approval console. Then continue toward the monumental V-shaped graphite portal and its single indigo sphere. Pass close enough for strong scale and parallax, then settle facing the clean mineral light beyond. Hold a calm, nearly static final composition for the CTA during the last 1.5 seconds. Never print the VARINO logo or any text. 8 seconds, 16:9, 24 fps, no audio.
```

## 5. Vídeos móviles 9:16

La cadena móvil se genera desde sus propias imágenes y fotogramas. No usar fotogramas 16:9.

### Clip móvil 01

```text
Single continuous vertical cinematic shot. Begin from the portrait friction atrium. Glide forward and slightly upward through vertically layered information paths, keeping the central indigo opening continuously visible. Create depth with slow foreground cards passing safely along the sides, never over the centre copy-safe area. End entering the indigo opening with a steady forward drift. 8 seconds, native 9:16, 24 fps, no audio.
```

### Clip móvil 02

```text
Continue the incoming portrait forward drift into a tall process-mapping chamber. Rise gently as input, validation, decision, exception and human review align vertically through the centre. Pause the rise around the human-review threshold, then resume forward toward the upper corridor. Keep upper and lower interface safe areas visually calm. 8 seconds, native 9:16, 24 fps, no audio.
```

Añadir el handoff global.

### Clip móvil 03

```text
Continue into the vertical automation line. Follow one request capsule upward through validation and a transparent rule module. Let an incomplete duplicate move sideways into the amber exception bay while the valid capsule continues upward. Reveal the manual recovery control without activating it. End advancing toward the next hall, with the central process readable on a phone. 8 seconds, native 9:16, 24 fps, no audio.
```

Añadir el handoff global.

### Clip móvil 04

```text
Continue into the portrait commercial signal hall. Three input channels rise from the lower edges and converge at the central qualification prism. Follow the selected opportunity upward to the mineral-white approval gate, which opens only after a subtle approval light. Continue toward the CRM archive in the upper third, then into the secure passage. Keep side motion restrained to preserve readability. 8 seconds, native 9:16, 24 fps, no audio.
```

Añadir el handoff global.

### Clip móvil 05

```text
Continue into the tall private knowledge vault. Orbit only a few degrees around the central query sphere while authorized source chambers illuminate at mid-height. Show one closed unauthorized chamber and one safe amber abstention threshold without shifting the focal subject outside the central phone area. Ease into a forward and upward drift toward the operations room. 8 seconds, native 9:16, 24 fps, no audio.
```

Añadir el handoff global.

### Clip móvil 06

```text
Continue into the portrait operations chamber. Separate protected light paths converge into the central control ring. Make a restrained upward crane movement that reveals the V-shaped graphite portal and indigo sphere in the upper third. Finish with the control ring still visible below and the portal above, preserving the lower safe area for the primary CTA. Hold the final composition for 1.5 seconds. No printed logo or text. 8 seconds, native 9:16, 24 fps, no audio.
```

## 6. Prompt de corrección de estilo

Usar solamente cuando una imagen se desvíe de la colección, adjuntando una imagen aprobada como referencia:

```text
Regenerate this scene as part of the exact same VARINO architectural world shown in the approved reference. Match its camera height, 35mm lens, graphite and smoked-glass materials, indigo light intensity, mineral-white surfaces, volumetric atmosphere, realistic scale, negative space and restrained premium mood. Preserve the requested scene subject but remove every stylistic deviation. Do not introduce new colors, interface screens, text, people, robots, cyberpunk elements or toy-like forms.
```

## 7. Prompt de re-render por handoff defectuoso

```text
Regenerate the same continuous shot from the supplied first frame. Preserve the scene content and camera path, but correct the ending: during the final one second the camera must settle into a slow, steady, sharp forward drift through the visible passage. Do not pull backward, orbit, tilt, accelerate, stop abruptly or end on motion blur. The final frame must be suitable as the exact first frame of the next continuous shot.
```

## 8. Criterios de aceptación por render

Aceptar una imagen únicamente si:

- parece parte del mismo complejo arquitectónico;
- no contiene texto o símbolos deformados;
- tiene una ruta clara para continuar la cámara;
- reserva espacio real para copy;
- no representa clientes, empleados o resultados.

Aceptar un vídeo únicamente si:

- el primer frame coincide con la imagen suministrada;
- no hay cortes ni morphing destructivo;
- la cámara obedece el movimiento conceptual;
- el último segundo cumple el handoff;
- el último frame es nítido;
- el movimiento funciona también reproducido hacia atrás.
