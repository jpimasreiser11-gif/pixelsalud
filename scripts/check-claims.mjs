import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const roots = ["src/pages", "src/config.ts"];
const forbidden = [
  ["marca anterior", /SYSTRA/i],
  ["prueba social no verificada", /clientes satisfechos|casos de éxito/i],
  ["garantía absoluta", /ahorro garantizado|cumplimiento 100%|sin riesgo/i],
  ["equipo no demostrado", /equipo de expertos/i],
  ["métrica heredada", /42 active nodes|4\.8M enterprise|75%|retorno desde el primer mes/i],
];

async function filesAt(path) {
  if (extname(path)) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => filesAt(join(path, entry.name))));
  return nested.flat().filter((file) => [".astro", ".ts", ".md"].includes(extname(file)));
}

const files = (await Promise.all(roots.map(filesAt))).flat();
const failures = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  for (const [label, pattern] of forbidden) {
    if (pattern.test(source)) failures.push(`${relative(process.cwd(), file)}: ${label}`);
  }
}

if (failures.length) {
  console.error("Claims check failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log(`Claims check passed (${files.length} public source files).`);
