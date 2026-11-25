const CARD_SELECTOR = "[data-library-card]";
const LAYOUT_ANIMATION_ID = "pond-library-layout";
const LAYOUT_DURATION_MS = 200;
const SNAPSHOT_MAX_AGE_MS = 500;
const SAME_INTERACTION_MS = 50;

interface LayoutSnapshot {
  capturedAt: number;
  cards: Map<string, DOMRect>;
  root: HTMLElement;
}

let pending: LayoutSnapshot | null = null;

function now(): number {
  return performance.now();
}

function reducedMotion(): boolean {
  if (document.documentElement.dataset.reduceMotion === "true") return true;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

function intersects(a: DOMRect, b: DOMRect): boolean {
  return (
    a.width > 0 &&
    a.height > 0 &&
    a.right > b.left &&
    a.left < b.right &&
    a.bottom > b.top &&
    a.top < b.bottom
  );
}

function clearPending(): void {
  if (pending) delete pending.root.dataset.layoutTransition;
  pending = null;
}

export function beginLibraryLayoutTransition(): void {
  if (reducedMotion()) {
    clearPending();
    return;
  }

  const viewport = document.querySelector<HTMLElement>(
    "[data-library-grid-viewport]",
  );
  const root = viewport?.closest<HTMLElement>("[data-slot=window]");
  if (!viewport || !root) {
    clearPending();
    return;
  }

  const capturedAt = now();
  if (
    pending?.root === root &&
    capturedAt - pending.capturedAt < SAME_INTERACTION_MS
  ) {
    return;
  }

  const viewportRect = viewport.getBoundingClientRect();
  const cards = new Map<string, DOMRect>();
  for (const card of viewport.querySelectorAll<HTMLElement>(CARD_SELECTOR)) {
    const id = card.dataset.saveId;
    if (!id) continue;
    const cardRect = card.getBoundingClientRect();
    if (intersects(cardRect, viewportRect)) cards.set(id, cardRect);
  }

  clearPending();
  pending = cards.size > 0 ? { capturedAt, cards, root } : null;
  if (pending) root.dataset.layoutTransition = "";
}

export function completeLibraryLayoutTransition(container: HTMLElement): void {
  const snapshot = pending;
  if (!snapshot) return;
  pending = null;
  delete snapshot.root.dataset.layoutTransition;

  if (now() - snapshot.capturedAt > SNAPSHOT_MAX_AGE_MS) return;
  if (container.closest("[data-slot=window]") !== snapshot.root) return;

  for (const card of container.querySelectorAll<HTMLElement>(CARD_SELECTOR)) {
    const id = card.dataset.saveId;
    const before = id ? snapshot.cards.get(id) : undefined;
    if (!before) continue;

    const after = card.getBoundingClientRect();
    if (after.width <= 0 || after.height <= 0) continue;
    const deltaX = before.left - after.left;
    const deltaY = before.top - after.top;
    const scaleX = before.width / after.width;
    const scaleY = before.height / after.height;
    const moved = Math.abs(deltaX) >= 0.5 || Math.abs(deltaY) >= 0.5;
    const resized =
      Math.abs(scaleX - 1) >= 0.005 || Math.abs(scaleY - 1) >= 0.005;
    if (!moved && !resized) continue;

    for (const animation of card.getAnimations()) {
      if (animation.id === LAYOUT_ANIMATION_ID) animation.cancel();
    }
    const animation = card.animate(
      [
        {
          scale: `${scaleX} ${scaleY}`,
          transformOrigin: "top left",
          translate: `${deltaX}px ${deltaY}px`,
        },
        {
          scale: "1 1",
          transformOrigin: "top left",
          translate: "0px 0px",
        },
      ],
      {
        composite: "add",
        duration: LAYOUT_DURATION_MS,
        easing: "cubic-bezier(0.165, 0.84, 0.44, 1)",
      },
    );
    animation.id = LAYOUT_ANIMATION_ID;
  }
}
