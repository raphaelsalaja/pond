/** The theme tokens switch on `data-theme`, so the page follows the reader's system setting through it. */
export function followColorScheme(
  root: HTMLElement,
  query: MediaQueryList,
): () => void {
  const apply = () => {
    root.dataset.theme = query.matches ? "dark" : "light";
  };
  apply();
  query.addEventListener("change", apply);
  return () => query.removeEventListener("change", apply);
}
