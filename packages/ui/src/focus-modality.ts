/** Chromium paints `:focus-visible` on pointer clicks; keep the ring for keyboard movement. */

const KEYS = new Set([
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "Enter",
  " ",
]);

let installed = false;

function install(): void {
  if (installed || !globalThis.document) return;
  installed = true;

  const root = globalThis.document.documentElement;

  root.addEventListener(
    "pointerdown",
    () => {
      root.dataset.focusSource = "pointer";
    },
    true,
  );

  root.addEventListener(
    "keydown",
    (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (KEYS.has(event.key)) {
        root.dataset.focusSource = "keyboard";
      }
    },
    true,
  );
}

install();
