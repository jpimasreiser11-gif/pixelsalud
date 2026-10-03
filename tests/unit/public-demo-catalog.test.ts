import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePublicDemo, type PublicDemoKey } from "../../src/lib/public-demo-catalog";

const files = { clinica: "clinica-intake", crecimiento: "leads-seguimiento", operaciones: "operaciones-bandeja" };
function workflow(key: PublicDemoKey) { return JSON.parse(readFileSync(`public/demos/${files[key]}.n8n.json`, "utf8")); }

describe("catálogo visual enlazado al archivo descargable", () => {
  it.each(Object.keys(files) as PublicDemoKey[])("%s usa exactamente el orden de nodos y los datos sintéticos del export", (key) => {
    const flow = workflow(key);
    const preview = describePublicDemo(flow, key);
    expect(preview.steps.map((step) => step.name)).toEqual(flow.nodes.slice(1).map((node: any) => node.name));
    expect(preview.sample.map((field) => field.value)).toEqual(flow.nodes[1].parameters.assignments.assignments.map((field: any) => field.value));
    expect(preview.steps.at(-1)?.name).toMatch(/^PARAR -/);
  });
  it.each(["active", "credentials", "extra-node", "rewired", "missing-input", "wrong-type", "real-id", "changed-code", "missing-note", "save-history", "no-timeout"])("rechaza %s antes de construir la página", (mutation) => {
    const flow = workflow("clinica");
    if (mutation === "active") flow.active = true;
    if (mutation === "credentials") flow.nodes[2].credentials = { fake: { id: "ref" } };
    if (mutation === "extra-node") flow.nodes.push({ id: "other", type: "n8n-nodes-base.httpRequest" });
    if (mutation === "rewired") flow.connections["Solicitud sintética"].main[0][0].node = "PARAR - revisión de recepción";
    if (mutation === "missing-input") flow.nodes[1].parameters.assignments.assignments.pop();
    if (mutation === "wrong-type") flow.nodes[2].type = "n8n-nodes-base.httpRequest";
    if (mutation === "real-id") flow.nodes[1].parameters.assignments.assignments[0].value = "customer-123";
    if (mutation === "changed-code") flow.nodes[2].parameters.jsCode += "\n// unreviewed change";
    if (mutation === "missing-note") delete flow.nodes[1].notes;
    if (mutation === "save-history") flow.settings.saveDataSuccessExecution = "all";
    if (mutation === "no-timeout") delete flow.settings.executionTimeout;
    expect(() => describePublicDemo(flow, "clinica")).toThrow();
  });
});
