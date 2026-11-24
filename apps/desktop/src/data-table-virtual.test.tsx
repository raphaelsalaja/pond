import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "../../../packages/ui/src/data-table";

class ElementResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("virtual DataTable navigation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it("reveals a distant cursor while retaining focus on the grid", async () => {
    vi.stubGlobal("ResizeObserver", ElementResizeObserver);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(
      3400,
    );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const rows = Array.from({ length: 100 }, (_, index) => ({
      id: `row-${index}`,
    }));
    let selection: Array<string> = [];
    try {
      await act(async () => {
        root.render(
          <DataTable.Provider
            data={rows}
            columns={[{ id: "name", header: "Name", cell: (row) => row.id }]}
            getRowId={(row) => row.id}
            height={100}
            rowHeight={34}
            onSelectionChange={(ids) => {
              selection = ids;
            }}
          >
            <DataTable.Hotkeys />
            <DataTable.Root aria-label="Virtual records" />
          </DataTable.Provider>,
        );
      });
      const grid = host.querySelector<HTMLElement>('[role="grid"]');
      const viewport = host.querySelector<HTMLElement>("[data-viewport]");
      if (!grid || !viewport) {
        throw new Error("Missing virtual table");
      }
      const scrollTo = vi.fn((options: ScrollToOptions) => {
        viewport.scrollTop = options.top ?? 0;
        viewport.dispatchEvent(new Event("scroll"));
      });
      Object.defineProperty(viewport, "scrollTo", { value: scrollTo });
      grid.focus();
      await act(() =>
        grid.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "End",
            bubbles: true,
            cancelable: true,
          }),
        ),
      );
      expect(selection).toEqual(["row-99"]);
      expect(document.activeElement).toBe(grid);
      const activeId = grid.getAttribute("aria-activedescendant");
      const active = activeId ? document.getElementById(activeId) : null;
      expect(active?.textContent).toBe("row-99");
      expect(active?.getAttribute("aria-rowindex")).toBe("101");
      expect(viewport.scrollTop).toBeGreaterThan(0);
      const other = document.createElement("button");
      host.append(other);
      other.focus();
      await act(async () => {
        viewport.scrollTop = 0;
        viewport.dispatchEvent(new Event("scroll"));
      });
      await act(async () => {
        grid.focus();
      });
      expect(viewport.scrollTop).toBeGreaterThan(0);
      expect(selection).toEqual(["row-99"]);
      expect(document.activeElement).toBe(grid);
      expect(host.querySelectorAll("[aria-selected]").length).toBeLessThan(100);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
