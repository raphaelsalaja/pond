/**
 * Drives the `[data-scroll-fade]` edge fades in `reset.css`; call `initScrollFade()` once per document or shadow root.
 * @remarks Scroll-driven CSS animations never finish, so they tick every frame and stall Base UI popups that wait on them.
 */

const DEFAULT_SIZE = 24;

interface FadeSizes {
  start: number;
  end: number;
}

const wired = new WeakSet<HTMLElement>();
const sizes = new WeakMap<HTMLElement, FadeSizes>();
const pending = new WeakSet<HTMLElement>();
const observers = new WeakMap<HTMLElement, ResizeObserver>();

function readSize(el: HTMLElement, name: string): number {
  const raw = getComputedStyle(el).getPropertyValue(name);
  const value = raw ? parseFloat(raw) : Number.NaN;
  return Number.isFinite(value) ? value : DEFAULT_SIZE;
}

function refresh(el: HTMLElement): void {
  const entry = sizes.get(el);
  if (!entry) return;
  const horizontal = el.dataset.scrollFade === "horizontal";
  const pos = horizontal ? el.scrollLeft : el.scrollTop;
  const max = Math.max(
    0,
    horizontal
      ? el.scrollWidth - el.clientWidth
      : el.scrollHeight - el.clientHeight,
  );
  const start = max > 0 ? Math.min(entry.start, Math.max(0, pos)) : 0;
  const end = max > 0 ? Math.min(entry.end, Math.max(0, max - pos)) : 0;

  const startStyle = `${start}px`;
  if (el.style.getPropertyValue("--sf-start") !== startStyle) {
    el.style.setProperty("--sf-start", startStyle);
  }
  const endStyle = `${end}px`;
  if (el.style.getPropertyValue("--sf-end") !== endStyle) {
    el.style.setProperty("--sf-end", endStyle);
  }
  const active = start > 0 || end > 0 ? "on" : "off";
  if (el.dataset.fadeActive !== active) {
    el.dataset.fadeActive = active;
  }
}

function schedule(el: HTMLElement): void {
  if (pending.has(el)) return;
  pending.add(el);
  requestAnimationFrame(() => {
    pending.delete(el);
    if (wired.has(el)) refresh(el);
  });
}

function wire(el: HTMLElement): void {
  if (wired.has(el)) return;
  wired.add(el);
  sizes.set(el, {
    start: readSize(el, "--scroll-fade-start-size"),
    end: readSize(el, "--scroll-fade-end-size"),
  });
  el.addEventListener("scroll", () => schedule(el), { passive: true });
  if ("ResizeObserver" in globalThis) {
    const observer = new ResizeObserver(() => schedule(el));
    observer.observe(el);
    observers.set(el, observer);
  }
  schedule(el);
}

function wireSubtree(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-scroll-fade]")) {
    wire(el);
  }
}

/** Content changes resize a scroller's extent without firing a scroll or resize event. */
function scrollerOf(node: Node): HTMLElement | null {
  /** SAFETY: nodeType === 1 (Node.ELEMENT_NODE) means node is an element. */
  let el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
  while (el) {
    if (el.hasAttribute("data-scroll-fade")) return el;
    el = el.parentElement;
  }
  return null;
}

let started = false;

export function initScrollFade(root?: ParentNode): void {
  if (started || !("document" in globalThis)) return;
  started = true;

  const scope = root ?? document;
  wireSubtree(scope);
  if (!("MutationObserver" in globalThis)) return;

  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        /** SAFETY: guarded above: node.nodeType === 1. */
        const el = node as HTMLElement;
        if (el.hasAttribute?.("data-scroll-fade")) {
          wire(el);
          continue;
        }
        wireSubtree(el);
      }
      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        const scroller = scrollerOf(node);
        if (scroller) schedule(scroller);
      }
    }
  });
  mutations.observe(scope, { childList: true, subtree: true });
}
