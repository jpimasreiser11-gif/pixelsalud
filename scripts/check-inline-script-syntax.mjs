// Gate del gotcha define:vars: los scripts inline de Astro no se compilan.
// Extrae cada <script> de src y comprueba que sea JS puro parseable.
import { readdirSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname;
let errores = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (extname(entry.name) === ".astro") revisar(full);
  }
}

function revisar(file) {
  const contenido = readFileSync(file, "utf8");
  if (/define:vars\s*=/.test(contenido)) {
    console.error(`✗ ${file}: usa la directiva de variables inline prohibida`);
    errores++;
  }
  // Fuera los <script ... /> autocerrados (JSON-LD) antes de extraer cuerpos.
  const sinAutocerrados = contenido.replace(/<script\b[^>]*\/>/g, "");
  const scripts = [
    ...sinAutocerrados.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g),
  ];
  for (const [, attrs, cuerpo] of scripts) {
    if (!cuerpo.trim()) continue;
    if (/ld\+json/.test(attrs) || /\bsrc\s*=/.test(attrs)) continue;
    try {
      new Function(cuerpo);
    } catch (e) {
      console.error(`✗ ${file}: script inline no es JS puro: ${e.message}`);
      errores++;
    }
  }
}

walk(ROOT);
if (errores > 0) process.exit(1);
console.log("✓ scripts:syntax en verde");
