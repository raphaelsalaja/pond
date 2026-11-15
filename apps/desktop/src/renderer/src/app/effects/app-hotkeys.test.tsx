import { PrefsSchema } from "@pond/schema";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  commandMenu,
  useCommandMenuOpen,
} from "@/features/library/state/command-menu";
import { libraryChrome } from "@/features/library/state/library-chrome";
import {
  libraryHeader,
  useViewPopover,
} from "@/features/library/state/library-header";
import {
  getViewState,
  searchAllSaves,
} from "@/features/library/state/view-store";
import type { ShortcutId } from "../../../../shared/shortcuts";
import { AppHotkeys } from "./app-hotkeys";
import { EditableHotkeyGuard } from "./editable-hotkey-guard";

function press(key: string, target: EventTarget = document) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function PopoverProbe() {
  return <output data-popover={useViewPopover() ?? "closed"} />;
}

function SearchProbe() {
  return <output data-search={useCommandMenuOpen() ? "open" : "closed"} />;
}

function attr(name: string): string {
  return (
    document
      .querySelector(`output[data-${name}]`)
      ?.getAttribute(`data-${name}`) ?? "missing"
  );
}

describe("app hotkeys in text fields", () => {
  let host: HTMLDivElement;
  let root: Root;
  let shortcutAction: ((id: ShortcutId) => void) | undefined;

  beforeEach(() => {
    vi.stubGlobal("pond", {
      query: async (name: string) =>
        name === "settings.getPrefs" ? PrefsSchema.parse({}) : [],
      onShortcutAction: (callback: (id: ShortcutId) => void) => {
        shortcutAction = callback;
        return () => {
          shortcutAction = undefined;
        };
      },
      syncRunAll: async () => {},
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    libraryHeader.closePopover();
    commandMenu.close();
    if (!libraryChrome.getState().sidebarOpen) libraryChrome.toggleSidebar();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  async function mount(field?: HTMLElement) {
    await act(async () => {
      root.render(
        <HotkeysProvider
          defaultOptions={{
            hotkey: { ignoreInputs: true },
            hotkeySequence: { ignoreInputs: true },
          }}
        >
          <EditableHotkeyGuard />
          <AppHotkeys />
          <PopoverProbe />
          <SearchProbe />
        </HotkeysProvider>,
      );
    });
    if (!field) return;
    host.append(field);
    field.focus();
    expect(document.activeElement).toBe(field);
  }

  it("toggles the sidebar when focus is not in a field", async () => {
    await mount();
    const open = libraryChrome.getState().sidebarOpen;
    await act(async () => press("["));
    expect(libraryChrome.getState().sidebarOpen).toBe(!open);
  });

  it("does not toggle the sidebar while typing in an input", async () => {
    const input = document.createElement("input");
    await mount(input);
    const open = libraryChrome.getState().sidebarOpen;
    await act(async () => press("[", input));
    expect(libraryChrome.getState().sidebarOpen).toBe(open);
  });

  it("does not open view options while typing in a textarea", async () => {
    const field = document.createElement("textarea");
    await mount(field);
    await act(async () => press("v", field));
    expect(attr("popover")).toBe("closed");
  });

  it("does not toggle the sidebar while typing in a contenteditable", async () => {
    const field = document.createElement("div");
    field.contentEditable = "true";
    field.tabIndex = 0;
    field.setAttribute("role", "textbox");
    await mount(field);
    const open = libraryChrome.getState().sidebarOpen;
    await act(async () => press("[", field));
    expect(libraryChrome.getState().sidebarOpen).toBe(open);
  });

  it("does not run layout or view keys from a nested fish composer node", async () => {
    const field = document.createElement("div");
    field.setAttribute("role", "textbox");
    field.tabIndex = 0;
    const span = document.createElement("span");
    field.append(span);
    await mount(field);
    span.focus();
    const open = libraryChrome.getState().sidebarOpen;
    const layout = getViewState().layout;
    await act(async () => {
      press("1", span);
      press("v", span);
      press("d", span);
      press("y", span);
      press("o", span);
      press("i", span);
      press("x", span);
      press("g", span);
      press("l", span);
    });
    expect(libraryChrome.getState().sidebarOpen).toBe(open);
    expect(getViewState().layout).toBe(layout);
    expect(attr("popover")).toBe("closed");
  });

  it("lets the field handle typing keys before stopping window listeners", async () => {
    const input = document.createElement("input");
    const field: string[] = [];
    input.addEventListener("keydown", (event) => field.push(event.key));
    await mount(input);
    const seen: string[] = [];
    const onBubble = (event: KeyboardEvent) => {
      seen.push(event.key);
    };
    window.addEventListener("keydown", onBubble);
    await act(async () => {
      press("[", input);
      press("Enter", input);
    });
    window.removeEventListener("keydown", onBubble);
    expect(field).toEqual(["[", "Enter"]);
    expect(seen).toEqual([]);
  });

  it("opens search from a field", async () => {
    const input = document.createElement("input");
    await mount(input);
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "k",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(attr("search")).toBe("open");
  });

  it("focuses current-view search on Mod+F", async () => {
    const focusSearch = vi.spyOn(libraryHeader, "focusSearch");
    searchAllSaves({ kind: "folder", id: "design" });
    await mount();
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "f",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(focusSearch).toHaveBeenCalledOnce();
    expect(getViewState().searchAllView).toBeNull();
    expect(attr("search")).toBe("closed");
    focusSearch.mockRestore();
  });

  it("leaves search to a field that handled the shortcut", async () => {
    const input = document.createElement("input");
    input.addEventListener("keydown", (event) => event.preventDefault());
    await mount(input);
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "k",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(attr("search")).toBe("closed");
  });

  it("does not cycle layout while typing in an input", async () => {
    const input = document.createElement("input");
    await mount(input);
    const layout = getViewState().layout;
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "l",
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(getViewState().layout).toBe(layout);
  });

  it("does not run a global shortcut command while typing in an input", async () => {
    const input = document.createElement("input");
    await mount(input);
    const layout = getViewState().layout;
    await act(async () => shortcutAction?.("view.layout-cycle"));
    expect(getViewState().layout).toBe(layout);
  });

  it("toggles details on the library without opening a save", async () => {
    await mount();
    libraryChrome.setDetailsOpen(true);
    const open = libraryChrome.getState().detailsOpen;
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "i",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(libraryChrome.getState().detailsOpen).toBe(!open);
  });

  it("runs a global shortcut command outside an input", async () => {
    await mount();
    const layout = getViewState().layout;
    await act(async () => shortcutAction?.("view.layout-cycle"));
    expect(getViewState().layout).not.toBe(layout);
  });
});
