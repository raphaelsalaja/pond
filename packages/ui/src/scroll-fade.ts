/**
 * Drives the `[data-scroll-fade]` edge fades declared in `reset.css`.
 *
 * This used to be pure CSS with scroll-driven animations
 * (`animation-timeline: scroll(self)`). Those animations never finish, so
 * the browser ticks them on the main thread every frame and keeps each
 * scroller's content in a masked offscreen surface — an unaffordable cost
 * on software rendering, where a library sidebar or grid can span hundreds
 * of thousands of pixels. Base UI waits on an element's animations before
 * opening popups, so the never-finished fades also hung popup mounts.
 *
 * This module reproduces the same fade from a passive scroll handler: it
 * mirrors the scroll position into `--sf-start` / `--sf-end` (only writing
 * when the rounded value changes, so a settled scroller does zero work)
 * and toggles `data-fade-active` so the mask exists only while a fade is
 * visible. Call `initScrollFade()` once per document (or pass the shadow
 * root it should watch).
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
  if (wired.has(el) || typeof el.addEventListener !== "function") return;
  wired.add(el);
  sizes.set(el, {
    start: readSize(el, "--scroll-fade-start-size"),
    end: readSize(el, "--scroll-fade-end-size"),
  });
  el.addEventListener("scroll", () => schedule(el), { passive: true });
  if (typeof ResizeObserver === "function") {
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

/** Nearest wired scroller enclosing `node`, if any (content changing inside
 *  one changes its scrollable extent without a scroll or size event). */
function scrollerOf(node: Node): HTMLElement | null {
  let el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
  while (el) {
    if (el.hasAttribute("data-scroll-fade")) return el;
    el = el.parentElement;
  }
  return null;
}

let started = false;

export function initScrollFade(root?: ParentNode): void {
  if (started || typeof document === "undefined") return;
  started = true;

  const scope = root ?? document;
  wireSubtree(scope);
  if (typeof MutationObserver === "undefined") return;

  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
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
