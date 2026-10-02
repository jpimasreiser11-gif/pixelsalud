import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchReady } from "../src/lib/launch-config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const previewRoute = "/brand/varino-logo-preview.html";
const socialImagePath = path.join(dist, "og", "varino-social.png");

function collectHtml(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? collectHtml(file) : entry.name.endsWith(".html") ? [file] : [];
  });
}

function metaTags(html) {
  return [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
}

function attribute(tag, name) {
  return tag?.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1] ?? "";
}

function findMeta(tags, key, value) {
  return tags.find((tag) => attribute(tag, key) === value);
}

const errors = [];
const titles = new Map();
const htmlFiles = collectHtml(dist);

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const route = `/${path.relative(dist, file).split(path.sep).join("/")}`.replace(/\/index\.html$/, "/");
  const title = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "")
    .replaceAll("&amp;", "&")
    .trim();
  const tags = metaTags(html);
  const description = attribute(findMeta(tags, "name", "description"), "content");
  const robots = attribute(findMeta(tags, "name", "robots"), "content").toLowerCase();
  const canonical = attribute(html.match(/<link\b[^>]*rel="canonical"[^>]*>/i)?.[0], "href");
  const ogImage = attribute(findMeta(tags, "property", "og:image"), "content");
  const twitterCard = attribute(findMeta(tags, "name", "twitter:card"), "content");
  const h1Count = [...html.matchAll(/<h1\b/gi)].length;

  if (!title) errors.push(`${route}: falta <title>`);
  if (title.length > 60) errors.push(`${route}: el title supera 60 caracteres (${title.length})`);
  if ((title.match(/\bVARINO\b/gi) ?? []).length > 1) errors.push(`${route}: la marca aparece repetida en el title`);
  if (route === previewRoute) {
    if (!robots.includes("noindex")) errors.push(`${route}: la previsualización debe ser noindex`);
    continue;
  }
  if (route === "/404.html" && !robots.includes("noindex")) {
    errors.push(`${route}: la página 404 debe ser noindex`);
  }

  if (!description || description.length < 50 || description.length > 180) {
    errors.push(`${route}: la meta descripción debe tener entre 50 y 180 caracteres`);
  }

  if (titles.has(title)) errors.push(`${route}: título duplicado también en ${titles.get(title)}`);
  else titles.set(title, route);

  const expectedPath = route === "/404.html" ? route : route.endsWith("/") ? route : `${route}/`;
  const expectedCanonical = new URL(expectedPath, "https://varinoai.me").href;
  if (route !== "/404.html" && canonical !== expectedCanonical) errors.push(`${route}: canonical ausente o inesperado`);
  if (h1Count !== 1) errors.push(`${route}: se esperaba un único H1, encontrados ${h1Count}`);
  if (ogImage !== "https://varinoai.me/og/varino-social.png") errors.push(`${route}: falta la imagen social Open Graph`);
  if (twitterCard !== "summary_large_image") errors.push(`${route}: falta Twitter Card grande`);
  if (!["/404.html", "/baja/"].includes(route) && launchReady && robots.includes("noindex")) errors.push(`${route}: launchReady está activo pero la página sigue en noindex`);
  if (route === "/baja/" && !robots.includes("noindex")) errors.push(`${route}: las preferencias personales deben ser noindex`);
  if (route !== "/404.html" && !launchReady && !robots.includes("noindex")) errors.push(`${route}: falta noindex mientras launchReady está desactivado`);
}

if (!htmlFiles.length) errors.push("dist no contiene páginas HTML; ejecuta primero npm run build");
if (!fs.existsSync(socialImagePath)) errors.push("falta dist/og/varino-social.png");
const sitemap = fs.existsSync(path.join(dist, "sitemap-index.xml"));
if (launchReady && !sitemap) errors.push("launchReady está activo pero falta sitemap-index.xml");
if (!launchReady && sitemap) errors.push("sitemap-index.xml no debe publicarse antes de launchReady");

if (errors.length) {
  console.error(`SEO: ${errors.length} problema(s) en ${htmlFiles.length} páginas:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`SEO OK: ${htmlFiles.length} HTML, títulos únicos, descripciones, H1, canonicals, tarjetas sociales y gate de indexación (${launchReady ? "listo" : "prelanzamiento noindex"}).`);
}
