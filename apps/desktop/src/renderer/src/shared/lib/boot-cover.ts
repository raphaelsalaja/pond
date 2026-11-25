const BOOT_FADE_MS = 220;

export function dismissBootCover(): void {
  if (!globalThis.document) return;
  const el = document.getElementById("boot");
  if (!el || el.dataset.state === "out") return;

  el.dataset.state = "out";
  el.setAttribute("aria-busy", "false");

  const remove = () => {
    el.remove();
  };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    remove();
    return;
  }

  el.addEventListener(
    "transitionend",
    (event) => {
      if (event.propertyName !== "opacity") return;
      remove();
    },
    { once: true },
  );
  window.setTimeout(remove, BOOT_FADE_MS);
}
