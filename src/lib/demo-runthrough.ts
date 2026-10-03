/** Visual playback only. No persistence, AI call, n8n execution or submission. */
export function mountDemoRunthrough(root: HTMLElement): () => void {
  const view = root.ownerDocument.defaultView;
  const play = root.querySelector<HTMLButtonElement>("[data-demo-run]");
  const previous = root.querySelector<HTMLButtonElement>("[data-demo-previous]");
  const next = root.querySelector<HTMLButtonElement>("[data-demo-next]");
  const reset = root.querySelector<HTMLButtonElement>("[data-demo-reset]");
  const status = root.querySelector<HTMLElement>("[data-demo-status]");
  const steps = Array.from(root.querySelectorAll<HTMLElement>("[data-demo-step]"));
  const controls = root.querySelector<HTMLElement>("[data-demo-controls]");
  if (!view || !play || !previous || !next || !reset || !status || !controls || !steps.length) return () => {};

  const motion = view.matchMedia("(prefers-reduced-motion: reduce)");
  const selectors = steps.map((step) => step.querySelector<HTMLButtonElement>("[data-demo-select]"));
  let index = -1;
  let playing = false;
  let timer: number | undefined;
  let disposed = false;
  const stopped = "Vista previa detenida. No se ha ejecutado n8n ni se han enviado o guardado datos.";
  const complete = "Vista previa completada: el caso queda pendiente de revisión humana. No se ejecutó n8n ni se guardaron o enviaron datos.";

  function stopTimer() {
    if (timer !== undefined) view!.clearTimeout(timer);
    timer = undefined;
    playing = false;
  }

  function render(prefix = "") {
    root.dataset.demoState = playing ? "playing" : index < 0 ? "idle" : index === steps.length - 1 ? "complete" : "paused";
    steps.forEach((step, stepIndex) => {
      if (stepIndex === index) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    });
    previous!.disabled = index <= 0;
    next!.disabled = index === steps.length - 1;
    play!.textContent = playing ? "Pausar recorrido" : index < 0 ? "Ver recorrido" : index === steps.length - 1 ? "Repetir recorrido" : "Continuar recorrido";
    play!.setAttribute("aria-pressed", String(playing));
    status!.textContent = index < 0 ? stopped : index === steps.length - 1 ? complete : `${prefix}Paso ${index + 1} de ${steps.length}: ${steps[index].querySelector("h3")?.textContent?.trim() ?? "Proceso"}.`;
  }

  function select(stepIndex: number) {
    stopTimer();
    index = Math.max(0, Math.min(steps.length - 1, stepIndex));
    render();
  }

  function schedule() {
    timer = view!.setTimeout(() => {
      timer = undefined;
      if (!playing || disposed) return;
      index += 1;
      if (index === steps.length - 1) playing = false;
      render();
      if (playing) schedule();
    }, 1800);
  }

  function onPlay() {
    if (playing) {
      stopTimer();
      render("Recorrido pausado. ");
      return;
    }
    if (motion.matches) {
      select(steps.length - 1);
      return;
    }
    if (index < 0 || index === steps.length - 1) index = 0;
    playing = index !== steps.length - 1;
    render();
    if (playing) schedule();
  }

  function onPrevious() { if (index > 0) select(index - 1); }
  function onNext() { if (index < steps.length - 1) select(index + 1); }
  function onReset() { stopTimer(); index = -1; render(); }
  function onVisibility() {
    if (root.ownerDocument.hidden && playing) {
      stopTimer();
      render("Recorrido pausado. ");
    }
  }
  function onMotionChange() { if (motion.matches && playing) select(steps.length - 1); }
  function onPageHide() { if (playing) { stopTimer(); render("Recorrido pausado. "); } }

  const selectionHandlers = selectors.map((selector, stepIndex) => {
    const click = () => select(stepIndex);
    const keydown = (event: KeyboardEvent) => {
      const target = event.key === "Home" ? 0 : event.key === "End" ? steps.length - 1 : event.key === "ArrowDown" || event.key === "ArrowRight" ? Math.min(steps.length - 1, stepIndex + 1) : event.key === "ArrowUp" || event.key === "ArrowLeft" ? Math.max(0, stepIndex - 1) : undefined;
      if (target === undefined) return;
      event.preventDefault();
      select(target);
      selectors[target]?.focus();
    };
    selector?.addEventListener("click", click);
    selector?.addEventListener("keydown", keydown);
    if (selector) selector.hidden = false;
    return { selector, click, keydown };
  });

  play.addEventListener("click", onPlay);
  previous.addEventListener("click", onPrevious);
  next.addEventListener("click", onNext);
  reset.addEventListener("click", onReset);
  root.ownerDocument.addEventListener("visibilitychange", onVisibility);
  view.addEventListener("pagehide", onPageHide);
  motion.addEventListener("change", onMotionChange);
  render();
  controls.hidden = false;

  return () => {
    disposed = true;
    stopTimer();
    play.removeEventListener("click", onPlay);
    previous.removeEventListener("click", onPrevious);
    next.removeEventListener("click", onNext);
    reset.removeEventListener("click", onReset);
    root.ownerDocument.removeEventListener("visibilitychange", onVisibility);
    view.removeEventListener("pagehide", onPageHide);
    motion.removeEventListener("change", onMotionChange);
    selectionHandlers.forEach(({ selector, click, keydown }) => {
      selector?.removeEventListener("click", click);
      selector?.removeEventListener("keydown", keydown);
      if (selector) selector.hidden = true;
    });
    controls.hidden = true;
    onReset();
  };
}
