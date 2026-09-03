// Comprueba que todo enlace interno del dist apunte a un archivo generado.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { DEPLOY_BASE } from "../astro.config.mjs";

const DIST = new URL("../dist", import.meta.url).pathname;
// La base de despliegue no existe como carpeta en dist: GitHub Pages la monta al servir.
const BASE = process.env.GITHUB_ACTIONS === "true" ? DEPLOY_BASE : "";
let errores = 0;
const paginas = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (extname(entry.name) === ".html") paginas.push(full);
  }
}

walk(DIST);

for (const pagina of paginas) {
  const html = readFileSync(pagina, "utf8");
  const hrefs = [...html.matchAll(/href="(\/[^"#]*)/g)].map((m) => m[1]);
  for (const href of new Set(hrefs)) {
    let limpio = href.split("?")[0];
    if (limpio === BASE || limpio.startsWith(BASE + "/")) {
      limpio = limpio.slice(BASE.length) || "/";
    }
    const candidatos = [
      join(DIST, limpio),
      join(DIST, limpio, "index.html"),
      join(DIST, limpio.replace(/\/$/, "") + ".html"),
    ];
    if (!candidatos.some((c) => existsSync(c))) {
      console.error(`✗ ${pagina.replace(DIST, "")}: enlace roto ${href}`);
      errores++;
    }
  }
}

if (errores > 0) process.exit(1);
console.log(`✓ links:check en verde (${paginas.length} páginas)`);
