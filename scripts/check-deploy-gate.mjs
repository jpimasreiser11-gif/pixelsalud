import { readFileSync } from "node:fs";
import { join } from "node:path";

const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/deploy.yml"),
  "utf8"
);
const gateIndex = workflow.indexOf(
  "- name: Require launch approval before production deploy"
);
const hostSecurityIndex = workflow.indexOf(
  "- name: Verify public host security headers before production deploy"
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
  hostSecurityIndex > gateIndex &&
  stampIndex > hostSecurityIndex &&
  artifactIndex > stampIndex &&
  /if:\s*github\.ref == ['"]refs\/heads\/main['"]/.test(gateBlock) &&
  /run:\s*npm run launch:check/.test(gateBlock) &&
  /run:\s*npm run security:origin/.test(gateBlock) &&
  /if:\s*github\.ref == ['"]refs\/heads\/main['"]/.test(deployHeader);

if (!valid) {
  console.error(
    "Pages debe aprobar el lanzamiento y verificar las cabeceras HTTP del origen en main antes de preparar el artefacto; solo despliega desde main."
  );
  process.exit(1);
}

console.log("✓ deploy:check en verde (aprobación y cabeceras antes de Pages)");
