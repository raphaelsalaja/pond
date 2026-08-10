import { useHotkeys } from "@tanstack/react-hotkeys";
import { SHORTCUTS } from "@/lib/save/shortcuts";
import { openLibrarySearch } from "@/lib/ui/open-search";
import { dockMode } from "@/stores/dock-mode";

function scrollActiveViewport(position: "top" | "bottom"): void {
  const active = document.activeElement;
  const target =
    active instanceof Element &&
    active !== document.body &&
    active !== document.documentElement
      ? active.closest<HTMLElement>("[data-scroll-viewport]")
      : document.querySelector<HTMLElement>("[data-scroll-viewport]");
  if (!target) return;
  target.scrollTo({
    top: position === "top" ? 0 : target.scrollHeight,
    behavior: "smooth",
  });
}

/**
 * Dock shortcuts owned by the renderer; the Go menu shows them display-only.
 * @remarks `ignoreInputs: false` so the dock opens even while a field is focused.
 */
export function AppHotkeys() {
  useHotkeys([
    {
      hotkey: SHORTCUTS["dock.ask"].keys,
      callback: () => dockMode.open("ask"),
      options: { ignoreInputs: false },
    },
    {
      hotkey: SHORTCUTS["dock.search"].keys,
      callback: () => openLibrarySearch(),
      options: { ignoreInputs: false },
    },
    {
      hotkey: SHORTCUTS["nav.scroll-top"].keys,
      callback: (event) => {
        event.preventDefault();
        scrollActiveViewport("top");
      },
      options: { ignoreInputs: true, preventDefault: false },
    },
    {
      hotkey: SHORTCUTS["nav.scroll-bottom"].keys,
      callback: (event) => {
        event.preventDefault();
        scrollActiveViewport("bottom");
      },
      options: { ignoreInputs: true, preventDefault: false },
    },
  ]);

  return null;
}
