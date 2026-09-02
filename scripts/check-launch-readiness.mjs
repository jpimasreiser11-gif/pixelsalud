import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const config = readFileSync(join(root, "src/config.ts"), "utf8");
const source = [
  "src/config.ts",
  "src/pages/index.astro",
  "src/pages/precios.astro",
  "src/pages/servicios.astro",
].map((file) => readFileSync(join(root, file), "utf8")).join("\n");

const failures = [];
const required = [
  ["legalOwner", /legalOwner:\s*"([^"]+)"/],
  ["legalNif", /legalNif:\s*"([^"]+)"/],
  ["legalAddress", /legalAddress:\s*"([^"]+)"/],
  ["email", /email:\s*"([^"]+)"/],
  ["url", /url:\s*"([^"]+)"/],
];

if (!/launchReady:\s*true/.test(config)) {
  failures.push("launchReady sigue en false");
}

if (!/domainVerified:\s*true/.test(config)) {
  failures.push("el dominio de VARINO no está verificado");
}

if (!/trademarkReviewed:\s*true/.test(config)) {
  failures.push("la revisión de marca OEPM/EUIPO no está aprobada");
}

for (const [name, pattern] of required) {
  const value = config.match(pattern)?.[1]?.trim();
  if (!value) failures.push(`${name} no está configurado`);
}

const emailValue = config.match(/email:\s*"([^"]*)"/)?.[1]?.trim();
const whatsappValue = config.match(/whatsapp:\s*"([^"]*)"/)?.[1]?.trim();
if (!emailValue && !whatsappValue) {
  failures.push("no hay un canal de contacto verificado");
}

function readApproval(relativePath, label, validate) {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`${label}: falta ${relativePath}`);
    return;
  }
  try {
    const value = JSON.parse(readFileSync(absolutePath, "utf8"));
    if (!validate(value)) failures.push(`${label}: aprobación incompleta`);
  } catch {
    failures.push(`${label}: JSON inválido`);
  }
}

readApproval(
  "ops/legal-review.json",
  "revisión legal",
  (value) => value?.approved === true
);
readApproval(
  "ops/security-audit.json",
  "auditoría de seguridad",
  (value) =>
    value?.approved === true &&
    Number(value?.unresolvedCritical ?? -1) === 0 &&
    Number(value?.unresolvedHigh ?? -1) === 0
);

if (config.includes("jpimasreiser11@gmail.com")) {
  failures.push("falta sustituir el Gmail personal por el correo profesional");
}

// Formato, no solo presencia. Un valor mal escrito pasa el "existe"
// y luego rompe el enlace en silencio, que es peor que estar vacío.
const whatsapp = config.match(/whatsapp:\s*"([^"]*)"/)?.[1]?.trim();
if (whatsapp && !/^[1-9]\d{7,14}$/.test(whatsapp)) {
  failures.push(
    `whatsapp "${whatsapp}" no sirve para wa.me: solo dígitos, con prefijo de país y sin "+" ni espacios (ej. 34600111222)`
  );
}

const email = emailValue;
if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  failures.push(`email "${email}" no tiene formato de correo válido`);
}

// Avisos: no bloquean la publicación, pero conviene verlos.
const warnings = [];
const url = config.match(/url:\s*"([^"]*)"/)?.[1]?.trim();
if (url?.includes("github.io")) {
  warnings.push(
    "url sigue apuntando a GitHub Pages. Si ya tienes dominio propio, cámbialo aquí y en astro.config.mjs (site y base)."
  );
}
if (!config.match(/calendly:\s*"([^"]+)"/)) {
  warnings.push("calendly vacío: no se mostrará el botón de reservar llamada.");
}

const robots = readFileSync(join(root, "public/robots.txt"), "utf8");
if (/launchReady:\s*true/.test(config) && /Disallow:\s*\//.test(robots)) {
  failures.push("robots.txt sigue bloqueando toda indexación");
}

const disallowedClaims = [
  "webs que llenan agendas",
  "traen visitas que acaban en citas",
  "sin que pierdas tu posicionamiento",
  "legales rgpd incluidos",
];

for (const claim of disallowedClaims) {
  if (source.toLowerCase().includes(claim)) {
    failures.push(`claim no demostrable: ${claim}`);
  }
}

if (failures.length) {
  console.error("\nLa web aún no está lista para publicar:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("\nPasos para arreglarlo: ops/PASOS-DEL-TITULAR.md\n");
  process.exit(1);
}

for (const warning of warnings) console.warn(`! aviso: ${warning}`);

console.log("✓ launch:check en verde");
