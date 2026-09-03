import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const files = [
  "clinica-intake.n8n.json",
  "leads-seguimiento.n8n.json",
  "operaciones-bandeja.n8n.json",
];

const workflows = files.map((file) => ({
  file,
  workflow: JSON.parse(readFileSync(join(process.cwd(), "public", "demos", file), "utf8")),
}));

describe("demos publicas de n8n", () => {
  it("tienen identificadores unicos y siempre se importan desactivadas", () => {
    const ids = workflows.map(({ workflow }) => workflow.id);
    expect(new Set(ids).size).toBe(files.length);
    for (const { file, workflow } of workflows) {
      expect(workflow.id, file).toMatch(/^varino-demo-/);
      expect(workflow.versionId, file).toBeTruthy();
      expect(workflow.name, file).toContain("[DEMO][INACTIVE]");
      expect(workflow.active, file).toBe(false);
    }
  });

  it("no contiene credenciales, disparadores publicos ni nodos con efectos externos", () => {
    const safeTypes = new Set([
      "n8n-nodes-base.manualTrigger",
      "n8n-nodes-base.set",
      "n8n-nodes-base.code",
    ]);

    for (const { file, workflow } of workflows) {
      expect(workflow.credentials, file).toBeUndefined();
      for (const node of workflow.nodes) {
        expect(safeTypes.has(node.type), `${file}: nodo no permitido ${node.type}`).toBe(true);
        expect(node.credentials, `${file}: ${node.name}`).toBeUndefined();
      }
    }
  });

  it("declara una parada humana y bloquea acciones externas", () => {
    for (const { file, workflow } of workflows) {
      const serialized = JSON.stringify(workflow);
      expect(serialized, file).toContain("externalActionsAllowed:false");
      expect(serialized, file).toMatch(/(?:REVIEW_REQUIRED|APPROVAL_REQUIRED)/);
      expect(workflow.nodes.at(-1)?.name, file).toMatch(/^PARAR -/);
    }
  });
});
