import { isHTMLElement } from "@pond/ui/dom";

const SETTLE_MS = 64;
const PANE_PROPERTIES = new Set([
  "--window-left-width",
  "--window-right-width",
]);

function isAnimatingPane(node: Element): boolean {
  const panes = node
    .closest("[data-slot=window]")
    ?.querySelector(":scope > [data-slot=panes]");
  return (
    panes
      ?.getAnimations?.()
      .some(
        (animation) =>
          "transitionProperty" in animation &&
          PANE_PROPERTIES.has(String(animation.transitionProperty)) &&
          animation.playState === "running",
      ) ?? false
  );
}

function isDraggingPane(node: Element): boolean {
  return Boolean(
    node.closest("[data-slot=window]")?.hasAttribute("data-resizing"),
  );
}

function isDiscreteLayoutTransition(node: Element): boolean {
  return Boolean(
    node.closest("[data-slot=window]")?.hasAttribute("data-layout-transition"),
  );
}

function isPaneWidthTransition(event: TransitionEvent): boolean {
  if (PANE_PROPERTIES.has(event.propertyName)) {
    return true;
  }
  if (event.propertyName !== "width") {
    return false;
  }
  const slot = isHTMLElement(event.target)
    ? event.target.dataset.slot
    : undefined;
  return slot === "left" || slot === "right";
}

export type SettledSizeHost = {
  observe: (element: HTMLElement, onResize: () => void) => () => void;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
};

const browserHost: SettledSizeHost = {
  observe: (element, onResize) => {
    const observer = new ResizeObserver(onResize);
    observer.observe(element);
    return () => observer.disconnect();
  },
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
};

export function observeSettledSize(
  element: HTMLElement,
  onSize: () => void,
  options: { continuous?: boolean } = {},
  host: SettledSizeHost = browserHost,
): () => void {
  let frame = 0;
  let timer = 0;
  const cancelScheduled = () => {
    if (frame) {
      host.cancelFrame(frame);
      frame = 0;
    }
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
  };
  const apply = () => {
    cancelScheduled();
    onSize();
  };
  const schedule = () => {
    if (isAnimatingPane(element)) {
      cancelScheduled();
      return;
    }
    if (isDiscreteLayoutTransition(element)) {
      apply();
      return;
    }
    if (options.continuous || isDraggingPane(element)) {
      if (timer) {
        clearTimeout(timer);
        timer = 0;
      }
      if (frame) {
        return;
      }
      frame = host.requestFrame(apply);
      return;
    }
    if (frame) {
      host.cancelFrame(frame);
      frame = 0;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = window.setTimeout(apply, SETTLE_MS);
  };
  const onTransitionEnd = (event: TransitionEvent) => {
    if (!isPaneWidthTransition(event)) {
      return;
    }
    if (isAnimatingPane(element)) {
      return;
    }
    apply();
  };

  apply();
  const stopObserving = host.observe(element, schedule);
  const root = element.closest("[data-slot=window]");
  root?.addEventListener("transitionend", onTransitionEnd);
  root?.addEventListener("transitioncancel", onTransitionEnd);

  return () => {
    stopObserving();
    root?.removeEventListener("transitionend", onTransitionEnd);
    root?.removeEventListener("transitioncancel", onTransitionEnd);
    if (frame) {
      host.cancelFrame(frame);
    }
    if (timer) {
      clearTimeout(timer);
    }
  };
}
