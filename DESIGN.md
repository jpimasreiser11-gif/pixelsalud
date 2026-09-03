# VARINO design contract

## Direction

Calma tecnológica editorial: precisión, espacio y confianza. Inspiración en la claridad de los productos Apple, sin copiar su identidad. La cualidad memorable es que la propuesta del cliente se transforma a la vista en un sistema comprensible.

## Color

- Papel: `#fbfbfd`; mineral: `#f5f5f7`; tinta: `#1d1d1f`.
- Noche: `#050505`; panel: `#111318`.
- Azul de acción: `#0071e3`. Índigo `#655cff` solo para estados de inteligencia, nunca como gradiente decorativo.
- Verde únicamente para estados realmente disponibles o verificados.

## Typography

- DM Sans Variable con fallbacks del sistema.
- Titulares de peso 650, tracking negativo y líneas cortas.
- Texto de lectura entre 16 y 18 px; microcopy nunca inferior a 11 px.

## Layout

- Ancho máximo 1152 px y ritmo vertical generoso.
- Una idea principal por sección.
- Evitar mosaicos de tarjetas intercambiables. Usar bordes y fondos solo para separar funciones reales.

## Components

- Botón principal azul, forma cápsula y altura mínima de 44 px.
- Botón secundario neutro.
- Casos: problema, flujo, control y siguiente paso; siempre indicar si son demostrativos o reales.
- Testimonios: solo con nombre, contexto, texto aprobado y consentimiento registrado.
- Estados de producto obligatorios: vacío, carga, error, resultado y aprobación.

## Motion

- Solo para comunicar cambio de estado; `opacity` y `transform`.
- Respetar `prefers-reduced-motion`.
- Sin scroll secuestrado, cinemáticas de entrada ni animación ornamental continua.

## Trust

- No inventar clientes, ahorros, cumplimiento, disponibilidad ni reseñas.
- Rangos de precio muestran supuestos e IVA.
- Toda acción externa sensible termina en aprobación humana.
