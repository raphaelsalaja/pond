export function prefersReducedMotion(): boolean {
  if (document.documentElement.dataset.reduceMotion === "true") return true;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}
