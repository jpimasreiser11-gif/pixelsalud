// Gate: la web publicada tiene que poder ejecutarse bajo su propia política de
// contenido. GitHub Pages ignora public/_headers, así que la única CSP que
// llega al navegador del visitante es el <meta http-equiv> que Astro escribe en
// cada página. Este gate comprueba tres cosas que en desarrollo no se ven:
//   1. Que cada página del build lleva su <meta> de CSP.
//   2. Que el <meta> y public/_headers no divergen en las directivas comunes.
//   3. Que nada del HTML quedaría bloqueado por la CSP más estricta de las dos:
//      scripts o estilos incrustados, atributos de evento, orígenes externos.
// El síntoma cuando esto se rompe es una web muda: sin tema, sin menú móvil y
// sin formulario, pero verde en `astro dev`.
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const distDir = join(root, "dist");

const fallos = [];
const nota = (mensaje) => fallos.push(mensaje);

const headers = await readFile(join(root, "public", "_headers"), "utf8").catch(() => "");
if (!headers) nota("falta public/_headers");

const cspHeader = headers.match(/Content-Security-Policy:\s*([^\n]+)/i)?.[1]?.trim() ?? "";
if (!cspHeader) nota("public/_headers no declara Content-Security-Policy");

function directivas(csp) {
  const mapa = new Map();
  for (const parte of csp.split(";")) {
    const limpio = parte.trim();
    if (!limpio) continue;
    const [nombre, ...valores] = limpio.split(/\s+/);
    mapa.set(nombre.toLowerCase(), valores.join(" "));
  }
  return mapa;
}

const headerDirs = directivas(cspHeader);
for (const obligatoria of ["default-src", "base-uri", "object-src", "frame-ancestors", "script-src", "style-src", "connect-src"]) {
  if (!headerDirs.has(obligatoria)) nota(`public/_headers no declara ${obligatoria}`);
}
for (const [nombre, valor] of headerDirs) {
  if (/'unsafe-inline'|'unsafe-eval'/.test(valor)) nota(`public/_headers relaja ${nombre} con ${valor.match(/'unsafe-[a-z]+'/)[0]}`);
  if (/(^|\s)\*(\s|$)/.test(valor)) nota(`public/_headers usa comodín en ${nombre}`);
}

async function paginasHtml(dir) {
  const salida = [];
  let entradas;
  try {
    entradas = await readdir(dir, { withFileTypes: true });
  } catch {
    return salida;
  }
  for (const entrada of entradas) {
    const full = join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...(await paginasHtml(full)));
    else if (entrada.name.endsWith(".html")) salida.push(full);
  }
  return salida;
}

const paginas = await paginasHtml(distDir);
if (paginas.length === 0) {
  console.error("✗ no hay HTML en dist/: ejecuta el build antes de este gate");
  process.exit(1);
}

// frame-ancestors y las cabeceras de transporte no existen en <meta>: son un
// límite del formato, no un descuido. Se comparan solo las directivas que
// ambos formatos admiten.
const soloCabecera = new Set(["frame-ancestors"]);
const conHashes = new Set(["script-src", "style-src"]);

for (const pagina of paginas) {
  const html = await readFile(pagina, "utf8");
  const nombre = relative(root, pagina);

  // El valor lleva comillas simples ('self', hashes), así que hay que acotar
  // el atributo por su propia comilla y no por "cualquier comilla".
  const metaTag = html.match(/<meta\s+http-equiv=["']content-security-policy["'][^>]*>/i)?.[0];
  const meta = metaTag?.match(/content="([^"]*)"/i)?.[1] ?? metaTag?.match(/content='([^']*)'/i)?.[1];
  if (!meta) {
    nota(`${nombre}: sin <meta> de CSP, la página se sirve sin política en GitHub Pages`);
  } else {
    const metaDirs = directivas(meta.replace(/&#39;/g, "'"));
    for (const [nombreDir, valorHeader] of headerDirs) {
      if (soloCabecera.has(nombreDir)) continue;
      if (!metaDirs.has(nombreDir)) {
        nota(`${nombre}: el <meta> no declara ${nombreDir} y la cabecera sí`);
        continue;
      }
      const valorMeta = metaDirs.get(nombreDir);
      // En script-src y style-src Astro añade los hashes de los recursos de la
      // página: basta con que conserve los orígenes de la cabecera.
      if (conHashes.has(nombreDir)) {
        for (const origen of valorHeader.split(/\s+/).filter(Boolean)) {
          if (!valorMeta.includes(origen)) nota(`${nombre}: el <meta> pierde ${origen} en ${nombreDir}`);
        }
      } else if (valorMeta !== valorHeader) {
        nota(`${nombre}: ${nombreDir} difiere — cabecera "${valorHeader}" vs meta "${valorMeta}"`);
      }
    }
    for (const [nombreDir, valor] of metaDirs) {
      if (/'unsafe-inline'|'unsafe-eval'/.test(valor)) nota(`${nombre}: el <meta> relaja ${nombreDir}`);
    }
  }

  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const atributos = match[1];
    const cuerpo = match[2].trim();
    const esDatos = /type\s*=\s*["'][^"']*(ld\+json|importmap|speculationrules)["']/i.test(atributos);
    if (cuerpo && !esDatos) nota(`${nombre}: <script> incrustado de ${cuerpo.length} B que la cabecera CSP bloquearía`);
    const src = atributos.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (src && /^(https?:)?\/\//i.test(src)) nota(`${nombre}: script de otro origen, prohibido por script-src 'self': ${src}`);
  }

  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    if (match[1].trim()) nota(`${nombre}: <style> incrustado que style-src 'self' bloquearía`);
  }
  for (const match of html.matchAll(/\sstyle=["'][^"']+["']/g)) {
    nota(`${nombre}: atributo style= en línea que style-src 'self' bloquearía (${match[0].trim().slice(0, 60)})`);
  }
  for (const match of html.matchAll(/\son(?:click|load|error|submit|change|input|focus|blur|mouseover|keydown|keyup)\s*=/gi)) {
    nota(`${nombre}: atributo de evento en línea (${match[0].trim()}) que la CSP bloquearía`);
  }
  for (const match of html.matchAll(/\b(?:href|src)\s*=\s*["'](javascript:[^"']*)["']/gi)) {
    nota(`${nombre}: URL javascript: bloqueada por la CSP (${match[1].slice(0, 40)})`);
  }
}

if (fallos.length) {
  console.error("Comprobación de CSP fallida:");
  for (const fallo of [...new Set(fallos)]) console.error(`  ✗ ${fallo}`);
  process.exit(1);
}

console.log(`✓ csp:check en verde (${paginas.length} páginas con <meta> propio y sin recursos en línea)`);
