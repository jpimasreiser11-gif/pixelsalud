import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

describe("public claims gate", () => {
  it("rejects legacy identity and unsupported claims", () => {
    expect(() => execFileSync(process.execPath, ["scripts/check-claims.mjs"], { stdio: "pipe" })).not.toThrow();
  });
});
