import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { DataTable } from "../../../packages/ui/src/data-table";

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });
}

describe("virtual DataTable navigation", () => {
  it("reveals a distant cursor while retaining focus on the grid", async () => {
    const host = document.createElement("div");
    host.style.width = "400px";
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
        await nextFrame();
      });
      const grid = host.querySelector<HTMLElement>('[role="grid"]');
      const viewport = host.querySelector<HTMLElement>("[data-viewport]");
      if (!grid || !viewport) {
        throw new Error("Missing virtual table");
      }
      grid.focus();
      await act(async () => {
        grid.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "End",
            bubbles: true,
            cancelable: true,
          }),
        );
        await nextFrame();
      });
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
        await nextFrame();
      });
      await act(async () => {
        grid.focus();
        await nextFrame();
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
