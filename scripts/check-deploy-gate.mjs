import { readFileSync } from "node:fs";
import { join } from "node:path";

const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/deploy.yml"),
  "utf8"
);
const gateIndex = workflow.indexOf(
  "- name: Require launch approval before production deploy"
);
const readinessIndex = workflow.indexOf("run: npm run readiness");
const stampIndex = workflow.indexOf("- name: Stamp deployed commit");
const artifactIndex = workflow.indexOf("- name: Upload Pages artifact");
const deployIndex = workflow.indexOf("  deploy:");
const environmentIndex = workflow.indexOf("    environment:", deployIndex);
const deployHeader = workflow.slice(deployIndex, environmentIndex);
const gateBlock = workflow.slice(gateIndex, stampIndex);

const valid =
  readinessIndex >= 0 &&
  gateIndex > readinessIndex &&
  stampIndex > gateIndex &&
  artifactIndex > stampIndex &&
  /if:\s*github\.ref == ['"]refs\/heads\/main['"]/.test(gateBlock) &&
  /run:\s*npm run launch:check/.test(gateBlock) &&
  /if:\s*github\.ref == ['"]refs\/heads\/main['"]/.test(deployHeader);

if (!valid) {
  console.error(
    "GitHub Pages debe ejecutar launch:check en main antes de preparar el artefacto y desplegar solo desde main."
  );
  process.exit(1);
}

console.log("✓ deploy:check en verde (bloqueo de lanzamiento antes de Pages)");
