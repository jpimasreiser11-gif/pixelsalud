import { readFileSync } from "node:fs";
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
  ["whatsapp", /whatsapp:\s*"([^"]+)"/],
];

if (!/launchReady:\s*true/.test(config)) {
  failures.push("launchReady sigue en false");
}

for (const [name, pattern] of required) {
  const value = config.match(pattern)?.[1]?.trim();
  if (!value) failures.push(`${name} no está configurado`);
}

if (config.includes("jpimasreiser11@gmail.com")) {
  failures.push("falta sustituir el Gmail personal por el correo profesional");
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
  console.error("\nPixelSalud aún no está lista para publicar:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("✓ launch:check en verde");
