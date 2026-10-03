import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const deploySource = readFileSync(join(root, ".github/workflows/deploy.yml"), "utf8");
const ciSource = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const script = join(root, "scripts/check-deploy-gate.mjs");

function check(deploy = deploySource, ci = ciSource) {
  const fixture = mkdtempSync(join(tmpdir(), "varino-deploy-gate-"));
  try {
    mkdirSync(join(fixture, ".github/workflows"), { recursive: true });
    writeFileSync(join(fixture, ".github/workflows/deploy.yml"), deploy);
    writeFileSync(join(fixture, ".github/workflows/ci.yml"), ci);
    return spawnSync(process.execPath, [script], { cwd: fixture, encoding: "utf8" });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

describe("deployment remains the verified, approved production build", () => {
  it("accepts the actual matching pinned installer and all existing gates", () => {
    expect(check().status).toBe(0);
  });

  it.each([
    ["default installer", deploySource.replace("npx --yes npm@11.19.1 ci", "npm ci"), ciSource],
    ["floating installer", deploySource.replace("npm@11.19.1", "npm@latest"), ciSource],
    ["different installer", deploySource.replace("npm@11.19.1", "npm@11.19.0"), ciSource],
    ["unverified installer", deploySource, ciSource.replace("npm@11.19.1", "npm@11.19.0")],
    ["unsupported shared major", deploySource.replace("npm@11.19.1", "npm@10.9.4"), ciSource.replace("npm@11.19.1", "npm@10.9.4")],
    ["missing launch approval", deploySource.replace("run: npm run launch:check", "run: true"), ciSource],
    ["missing public header gate", deploySource.replace("run: npm run security:origin", "run: true"), ciSource],
    ["launch gate on any branch", deploySource.replace("        if: github.ref == 'refs/heads/main'", "        if: true"), ciSource],
    ["header gate on any branch", deploySource.replace("- name: Verify public host security headers before production deploy\n        if: github.ref == 'refs/heads/main'", "- name: Verify public host security headers before production deploy\n        if: true"), ciSource],
    ["branch deployment", deploySource.replace("\n    if: github.ref == 'refs/heads/main'", "\n    if: true"), ciSource],
    ["missing public smoke", deploySource.replace("run: npm run production:smoke", "run: true"), ciSource],
    ["missing deployed version contract", deploySource.replace("VARINO_EXPECTED_VERSION: ${{ github.sha }}", "VARINO_EXPECTED_VERSION: wrong"), ciSource],
  ])("rejects %s without publishing", (_label, deploy, ci) => {
    const result = check(deploy, ci);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Pages debe");
  });
});
