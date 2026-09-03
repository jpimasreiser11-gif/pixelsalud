// Servidor estático mínimo que imita a GitHub Pages para poder probar el
// artefacto que realmente se publica.
//
// Por qué existe: GitHub Pages no permite configurar cabeceras HTTP, así que
// ignora public/_headers. `astro preview` sí las envía, lo que da una falsa
// sensación de seguridad y esconde el caso real: en producción la única
// política de contenido que llega al navegador es el <meta http-equiv> del
// HTML. Este servidor no añade ninguna cabecera de seguridad a propósito.
//
// Uso: node scripts/serve-dist.mjs [--port 4455] [--root dist]
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const args = process.argv.slice(2);
const flag = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};

const port = Number(flag("port", "4455"));
const root = resolve(new URL("..", import.meta.url).pathname, flag("root", "dist"));
const base = `/${flag("base", "").replace(/^\/+|\/+$/g, "")}`.replace(/^\/$/, "");

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".ico": "image/x-icon",
};

async function resolverFichero(pathname) {
  if (base) {
    if (pathname === base) pathname = "/";
    else if (pathname.startsWith(`${base}/`)) pathname = pathname.slice(base.length) || "/";
    else return null;
  }
  // normalize + comprobación de prefijo: sin esto, "/../../etc/passwd" saldría
  // del directorio publicado.
  const limpio = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let candidato = join(root, limpio);
  if (!candidato.startsWith(root + sep) && candidato !== root) return null;

  const info = await stat(candidato).catch(() => null);
  if (info?.isDirectory()) candidato = join(candidato, "index.html");
  else if (!info && !extname(candidato)) candidato = join(candidato, "index.html");

  const final = await stat(candidato).catch(() => null);
  return final?.isFile() ? candidato : null;
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${port}`);
  const fichero = (await resolverFichero(pathname)) ?? (await resolverFichero(`${base}/404.html`));
  if (!fichero) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404");
    return;
  }
  const esError = fichero.endsWith("404.html") && pathname !== "/404.html";
  res.writeHead(esError ? 404 : 200, { "content-type": TIPOS[extname(fichero)] ?? "application/octet-stream" });
  createReadStream(fichero).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Sirviendo ${root} en http://localhost:${port}${base || "/"} sin cabeceras de seguridad (paridad con GitHub Pages)`);
});
