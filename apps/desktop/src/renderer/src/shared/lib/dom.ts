export function findScrollParent(
  el: HTMLElement | null,
  { fallbackToDocument = true }: { fallbackToDocument?: boolean } = {},
): HTMLElement | null {
  if (!el) return null;
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if (oy === "auto" || oy === "scroll" || oy === "overlay") return node;
    node = node.parentElement;
  }
  return fallbackToDocument ? document.documentElement : null;
}
