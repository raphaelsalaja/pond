/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataTable } from ".";
import { isHTMLElement } from "../dom";
import type { TableColumn } from "./types";

interface TestRow {
  id: string;
  name: string;
  status: string;
}

const columns: Array<TableColumn<TestRow>> = [
  {
    id: "name",
    header: "Name",
    sortLabel: "Name",
    accessor: (row) => row.name,
    width: "300px",
    resizable: true,
    reorderable: true,
    cell: (row) => row.name,
  },
  {
    id: "status",
    header: "Status",
    sortLabel: "Status",
    accessor: (row) => row.status,
    width: "300px",
    reorderable: true,
    cell: (row) => row.status,
  },
];

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

async function click(node: HTMLElement, init: MouseEventInit = {}) {
  await act(() =>
    node.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, ...init }),
    ),
  );
}

describe("DataTable", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
  });

  async function renderTable(
    onColumnOrderChange?: (order: Array<string>) => void,
  ) {
    await act(async () => {
      root.render(
        <DataTable.Provider
          data={[{ id: "one", name: "First", status: "Waiting" }]}
          columns={columns}
          getRowId={(row) => row.id}
          columnOrder={["name", "status"]}
          onColumnOrderChange={onColumnOrderChange}
          onSelectionChange={() => {}}
        >
          <DataTable.Root aria-label="Test records" />
        </DataTable.Provider>,
      );
    });
  }

  function checkbox(label: string): HTMLElement {
    const node = host.querySelector<HTMLElement>(
      `[role="checkbox"][aria-label="${label}"]`,
    );
    if (!node) {
      throw new Error(`Missing ${label} checkbox`);
    }
    return node;
  }

  function rowCheckbox(id: string): HTMLElement {
    const node = [...host.querySelectorAll('[role="rowgroup"] [role="row"]')]
      .find((row) => row.textContent?.includes(id))
      ?.querySelector<HTMLElement>('[role="checkbox"]');
    if (!node) {
      throw new Error(`Missing ${id} row checkbox`);
    }
    return node;
  }

  it("keeps the header and rows on one horizontal scroll", async () => {
    await renderTable();
    const viewport = host.querySelector<HTMLElement>("[data-viewport]");
    const sheet = viewport?.firstElementChild;
    const headerRow = viewport?.querySelector<HTMLElement>(
      '[role="columnheader"]',
    )?.parentElement;
    const dataRow = viewport?.querySelector<HTMLElement>(
      '[role="row"][aria-selected]',
    );
    if (!viewport || !isHTMLElement(sheet) || !headerRow || !dataRow) {
      throw new Error("Missing shared table viewport");
    }

    expect(sheet.style.minWidth).toBe("640px");
    expect(headerRow.style.gridTemplateColumns).toBe(
      dataRow.style.gridTemplateColumns,
    );
    expect(headerRow.closest("[data-viewport]")).toBe(viewport);
    expect(dataRow.closest("[data-viewport]")).toBe(viewport);
  });

  it("exposes sorting state and keyboard-accessible column resizing", async () => {
    await renderTable();
    const sort = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Sort by Name"]',
    );
    const nameHeader = sort?.closest<HTMLElement>('[role="columnheader"]');
    expect(nameHeader?.getAttribute("aria-sort")).toBe("none");
    await act(async () => {
      sort?.click();
    });
    expect(nameHeader?.getAttribute("aria-sort")).toBe("ascending");

    const resize = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Resize Name column"]',
    );
    expect(resize).not.toBeNull();
    await act(() =>
      resize?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
    );
    expect(
      host.querySelector<HTMLElement>('[role="rowgroup"] > [role="row"]')?.style
        .gridTemplateColumns,
    ).toContain("48px 300px");
  });

  it("provides a keyboard alternative to dragging columns", async () => {
    const onColumnOrderChange = vi.fn();
    await renderTable(onColumnOrderChange);
    const sort = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Sort by Name"]',
    );

    await act(() =>
      sort?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          altKey: true,
          bubbles: true,
        }),
      ),
    );

    expect(sort?.getAttribute("aria-keyshortcuts")).toBe(
      "Alt+ArrowLeft Alt+ArrowRight",
    );
    expect(onColumnOrderChange).toHaveBeenCalledWith(["status", "name"]);
  });

  describe("selection checkboxes", () => {
    const rows: Array<TestRow> = ["one", "two", "three", "four"].map((id) => ({
      id,
      name: id,
      status: "Waiting",
    }));

    async function renderSelectable(
      onSelectionChange: (ids: Array<string>) => void,
    ) {
      await act(async () => {
        root.render(
          <DataTable.Provider
            data={rows}
            columns={columns}
            getRowId={(row) => row.id}
            checkboxVisibility="hover"
            onSelectionChange={onSelectionChange}
          >
            <DataTable.Root aria-label="Test records" />
          </DataTable.Provider>,
        );
      });
    }

    it("selects and clears every row from the header checkbox", async () => {
      const onSelectionChange = vi.fn();
      await renderSelectable(onSelectionChange);

      await click(checkbox("Select All Rows"));
      expect(onSelectionChange).toHaveBeenLastCalledWith([
        "one",
        "two",
        "three",
        "four",
      ]);
      expect(checkbox("Deselect All Rows").getAttribute("aria-checked")).toBe(
        "true",
      );

      await click(checkbox("Deselect All Rows"));
      expect(onSelectionChange).toHaveBeenLastCalledWith([]);
      expect(checkbox("Select All Rows").getAttribute("aria-checked")).toBe(
        "false",
      );
    });

    it("shows a mixed header state and selects the rest from it", async () => {
      const onSelectionChange = vi.fn();
      await renderSelectable(onSelectionChange);

      await click(rowCheckbox("two"));
      expect(checkbox("Select All Rows").getAttribute("aria-checked")).toBe(
        "mixed",
      );

      await click(checkbox("Select All Rows"));
      expect(onSelectionChange).toHaveBeenLastCalledWith([
        "one",
        "two",
        "three",
        "four",
      ]);
    });

    it("extends a range when a row checkbox is Shift-clicked", async () => {
      const onSelectionChange = vi.fn();
      await renderSelectable(onSelectionChange);

      await click(rowCheckbox("one"));
      await click(rowCheckbox("three"), { shiftKey: true });
      expect(onSelectionChange).toHaveBeenLastCalledWith([
        "one",
        "two",
        "three",
      ]);

      await click(rowCheckbox("four"));
      expect(onSelectionChange).toHaveBeenLastCalledWith([
        "one",
        "two",
        "three",
        "four",
      ]);
    });

    it("marks hover checkboxes and keeps them visible while selecting", async () => {
      await renderSelectable(() => {});
      const grid = host.querySelector<HTMLElement>('[role="grid"]');
      expect(grid?.dataset.checkboxes).toBe("hover");
      expect(grid?.hasAttribute("data-selecting")).toBe(false);

      await click(rowCheckbox("one"));
      expect(grid?.hasAttribute("data-selecting")).toBe(true);
    });
  });
});
