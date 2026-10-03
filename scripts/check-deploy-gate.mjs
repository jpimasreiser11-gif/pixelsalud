import { readFileSync } from "node:fs";
import { join } from "node:path";

const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/deploy.yml"),
  "utf8"
);
const verification = readFileSync(
  join(process.cwd(), ".github/workflows/ci.yml"),
  "utf8"
);
// The installer is part of the tested build. A default/different npm version
// can reject scoped overrides even when verification passed for this commit.
const installerPattern = /^\s*run:\s*npx --yes npm@(11\.\d+\.\d+) ci\s*$/m;
const deployInstaller = workflow.match(installerPattern)?.[1];
const verificationInstaller = verification.match(installerPattern)?.[1];
const gateIndex = workflow.indexOf(
  "- name: Require launch approval before production deploy"
);
const hostSecurityIndex = workflow.indexOf(
  "- name: Verify public host security headers before production deploy"
);
const readinessIndex = workflow.indexOf("run: npm run readiness");
const stampIndex = workflow.indexOf("- name: Stamp deployed commit");
const artifactIndex = workflow.indexOf("- name: Upload Pages artifact");
const deployActionIndex = workflow.indexOf("- name: Deploy to GitHub Pages");
const smokeIndex = workflow.indexOf(
  "- name: Verify deployed website from the public edge"
);
const deployIndex = workflow.indexOf("  deploy:");
const environmentIndex = workflow.indexOf("    environment:", deployIndex);
const deployHeader = workflow.slice(deployIndex, environmentIndex);
const gateBlock = workflow.slice(gateIndex, hostSecurityIndex);
const hostSecurityBlock = workflow.slice(hostSecurityIndex, stampIndex);
const smokeBlock = workflow.slice(smokeIndex);

const valid =
  Boolean(deployInstaller && deployInstaller === verificationInstaller) &&
  readinessIndex >= 0 &&
  gateIndex > readinessIndex &&
  hostSecurityIndex > gateIndex &&
  stampIndex > hostSecurityIndex &&
  artifactIndex > stampIndex &&
  /if:\s*github\.ref == ['"]refs\/heads\/main['"]/.test(gateBlock) &&
  /run:\s*npm run launch:check/.test(gateBlock) &&
  /if:\s*github\.ref == ['"]refs\/heads\/main['"]/.test(hostSecurityBlock) &&
  /run:\s*npm run security:origin/.test(hostSecurityBlock) &&
  /if:\s*github\.ref == ['"]refs\/heads\/main['"]/.test(deployHeader) &&
  deployActionIndex > deployIndex &&
  smokeIndex > deployActionIndex &&
  /VARINO_EXPECTED_VERSION:\s*\$\{\{\s*github\.sha\s*\}\}/.test(smokeBlock) &&
  /run:\s*npm run production:smoke/.test(smokeBlock);

if (!valid) {
  console.error(
    "Pages debe usar el mismo npm 11 fijado que CI, verificar aprobación y cabeceras antes del artefacto, desplegar solo desde main y comprobar desde el borde público la versión esperada después del deploy."
  );
  process.exit(1);
}

console.log(
  "✓ deploy:check en verde (instalador fijado común, gates previos y smoke público posterior al deploy)"
);
