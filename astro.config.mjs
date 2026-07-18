import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// Hosting gratuito actual: GitHub Pages bajo /pixelsalud.
// Al comprar pixelsalud.es: site a "https://pixelsalud.es" y quitar base.
export default defineConfig({
  site: "https://jpimasreiser11-gif.github.io",
  base: "/pixelsalud",
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
