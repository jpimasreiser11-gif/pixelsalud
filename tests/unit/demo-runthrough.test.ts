import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountDemoRunthrough } from "../../src/lib/demo-runthrough";

let reduced = false;
let motion: EventTarget;
let cleanups: (() => void)[];
function fixture() {
  const root = document.createElement("article");
  root.innerHTML = `<ol>${["Entrada", "Validar", "PARAR - revisión"].map((name) => `<li data-demo-step><h3>${name}</h3><button hidden data-demo-select>Explorar</button></li>`).join("")}</ol><p data-demo-status></p><div hidden data-demo-controls><button data-demo-run>Ver recorrido</button><button data-demo-previous>Anterior</button><button data-demo-next>Siguiente</button><button data-demo-reset>Reiniciar</button></div>`;
  document.body.append(root);
  cleanups.push(mountDemoRunthrough(root));
  return root;
}
function button(root: HTMLElement, name: string) { return root.querySelector<HTMLButtonElement>(`[data-demo-${name}]`)!; }
function current(root: HTMLElement) { return root.querySelector<HTMLElement>('[aria-current="step"] h3')?.textContent; }

beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  cleanups = [];
  motion = new EventTarget();
  Object.defineProperty(motion, "matches", { get: () => reduced });
  vi.stubGlobal("matchMedia", () => motion);
});
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("recorridos visuales controlables", () => {
  it("no inicia movimiento automáticamente y habilita controles solo después de montar", () => {
    const root = fixture();
    expect(root.dataset.demoState).toBe("idle");
    expect(current(root)).toBeUndefined();
    expect(button(root, "previous").disabled).toBe(true);
    expect(button(root, "next").disabled).toBe(false);
    expect(root.querySelector<HTMLElement>("[data-demo-controls]")!.hidden).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("mantiene el botón habilitado y permite pausar antes del siguiente paso", () => {
    const root = fixture();
    button(root, "run").click();
    expect(current(root)).toBe("Entrada");
    expect(button(root, "run").disabled).toBe(false);
    expect(button(root, "run").textContent).toBe("Pausar recorrido");
    button(root, "run").click();
    vi.advanceTimersByTime(10_000);
    expect(current(root)).toBe("Entrada");
    expect(vi.getTimerCount()).toBe(0);
    expect(root.textContent).toContain("Recorrido pausado");
    button(root, "run").click();
    vi.advanceTimersByTime(1800);
    expect(current(root)).toBe("Validar");
    vi.advanceTimersByTime(1800);
    expect(current(root)).toBe("PARAR - revisión");
    expect(root.dataset.demoState).toBe("complete");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("seleccionar o retroceder interrumpe el temporizador sin saltos posteriores", () => {
    const root = fixture();
    button(root, "run").click();
    button(root, "next").click();
    expect(current(root)).toBe("Validar");
    vi.advanceTimersByTime(10_000);
    expect(current(root)).toBe("Validar");
    button(root, "previous").click();
    expect(current(root)).toBe("Entrada");
    root.querySelectorAll<HTMLButtonElement>("[data-demo-select]")[2].click();
    expect(current(root)).toBe("PARAR - revisión");
    expect(button(root, "next").disabled).toBe(true);
  });
  it("reiniciar limpia el paso, la presión accesible y los temporizadores", () => {
    const root = fixture();
    button(root, "run").click();
    button(root, "reset").click();
    expect(current(root)).toBeUndefined();
    expect(button(root, "run").getAttribute("aria-pressed")).toBe("false");
    expect(root.dataset.demoState).toBe("idle");
    expect(root.textContent).toContain("No se ha ejecutado n8n");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("con movimiento reducido muestra el resultado estático sin temporizador", () => {
    reduced = true;
    const root = fixture();
    button(root, "run").click();
    expect(current(root)).toBe("PARAR - revisión");
    expect(vi.getTimerCount()).toBe(0);
    button(root, "previous").click();
    expect(current(root)).toBe("Validar");
  });
  it("respeta cambiar la preferencia de movimiento durante la reproducción", () => {
    const root = fixture();
    button(root, "run").click();
    reduced = true;
    motion.dispatchEvent(new Event("change"));
    expect(current(root)).toBe("PARAR - revisión");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("pausa al abandonar la página y no reanuda por su cuenta", () => {
    const root = fixture();
    button(root, "run").click();
    window.dispatchEvent(new Event("pagehide"));
    vi.advanceTimersByTime(10_000);
    expect(current(root)).toBe("Entrada");
    expect(root.dataset.demoState).toBe("paused");
  });
  it("pausa al ocultar la pestaña", () => {
    const root = fixture();
    button(root, "run").click();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(root.dataset.demoState).toBe("paused");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("las tres instancias no modifican el estado de sus vecinas", () => {
    const roots = [fixture(), fixture(), fixture()];
    button(roots[1], "next").click();
    expect(current(roots[0])).toBeUndefined();
    expect(current(roots[1])).toBe("Entrada");
    expect(current(roots[2])).toBeUndefined();
  });
  it("flechas, Inicio y Fin seleccionan y trasladan el foco sin animación bloqueante", () => {
    const root = fixture();
    const selectors = root.querySelectorAll<HTMLButtonElement>("[data-demo-select]");
    selectors[0].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(document.activeElement).toBe(selectors[2]);
    expect(current(root)).toBe("PARAR - revisión");
    selectors[2].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(document.activeElement).toBe(selectors[1]);
    expect(current(root)).toBe("Validar");
    selectors[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(document.activeElement).toBe(selectors[0]);
    expect(current(root)).toBe("Entrada");
  });
  it("desmontar retira listeners y no deja reproducción en segundo plano", () => {
    const root = fixture();
    button(root, "run").click();
    cleanups.pop()!();
    button(root, "run").click();
    expect(root.dataset.demoState).toBe("idle");
    expect(vi.getTimerCount()).toBe(0);
    expect(root.querySelector<HTMLElement>("[data-demo-controls]")!.hidden).toBe(true);
  });
  it("un bloque incompleto no muestra controles muertos", () => {
    const root = document.createElement("article");
    root.innerHTML = '<div hidden data-demo-controls></div>';
    expect(() => mountDemoRunthrough(root)()).not.toThrow();
    expect(root.querySelector<HTMLElement>("[data-demo-controls]")!.hidden).toBe(true);
  });
});
