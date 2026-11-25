import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DataTable } from "../../../packages/ui/src/data-table";

interface RecordRow {
  id: string;
}
const records: Array<RecordRow> = ["A", "B", "C", "D"].map((id) => ({ id }));

async function press(key: string, options: KeyboardEventInit = {}) {
  await act(() =>
    (document.activeElement ?? document).dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...options,
      }),
    ),
  );
}

describe("DataTable keyboard selection", () => {
  let host: HTMLDivElement;
  let root: Root;
  let selected: Array<string>;
  let opened: Array<string>;
  function grid() {
    const element = host.querySelector<HTMLElement>('[role="grid"]');
    if (!element) throw new Error("Missing grid");
    return element;
  }
  function row(id: string) {
    const element = [
      ...host.querySelectorAll<HTMLElement>('[role="row"][aria-selected]'),
    ].find((item) => item.textContent === id);
    if (!element) throw new Error(`Missing row ${id}`);
    return element;
  }
  beforeEach(async () => {
    selected = [];
    opened = [];
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <DataTable.Provider
          data={records}
          columns={[{ id: "name", header: "Name", cell: (item) => item.id }]}
          getRowId={(item) => item.id}
          selectionCheckboxes={false}
          onSelectionChange={(ids) => {
            selected = ids;
          }}
          onRowClick={(item) => opened.push(item.id)}
        >
          <DataTable.Hotkeys />
          <DataTable.Root aria-label="Test records" />
        </DataTable.Provider>,
      );
    });
  });
  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
  it("extends upward repeatedly and shrinks the range when reversing", async () => {
    await act(async () => {
      row("C").click();
    });
    expect(document.activeElement).toBe(grid());
    await press("ArrowUp", { shiftKey: true });
    expect(selected).toEqual(["B", "C"]);
    await press("ArrowUp", { shiftKey: true });
    expect(selected).toEqual(["A", "B", "C"]);
    await press("ArrowDown", { shiftKey: true });
    expect(selected).toEqual(["B", "C"]);
    await press("Enter");
    expect(opened.at(-1)).toBe("B");
    expect(grid().getAttribute("aria-activedescendant")).toBe(row("B").id);
  });
  it("opens an available row after the previously focused row disappears", async () => {
    await act(async () => {
      row("C").click();
    });
    await act(async () => {
      root.render(
        <DataTable.Provider
          data={records.filter((record) => record.id !== "C")}
          columns={[{ id: "name", header: "Name", cell: (item) => item.id }]}
          getRowId={(item) => item.id}
          selectionCheckboxes={false}
          onSelectionChange={(ids) => {
            selected = ids;
          }}
          onRowClick={(item) => opened.push(item.id)}
        >
          <DataTable.Hotkeys />
          <DataTable.Root aria-label="Test records" />
        </DataTable.Provider>,
      );
    });
    opened = [];
    await press("Enter");
    expect(opened).toEqual(["A"]);
    expect(grid().getAttribute("aria-activedescendant")).toBe(row("A").id);
  });
  it("leaves selection alone while focus is in another pane", async () => {
    await act(async () => {
      row("B").click();
    });
    const button = document.createElement("button");
    host.append(button);
    button.focus();
    await press("ArrowDown");
    await press("a", { ctrlKey: true });
    await press("Escape");
    expect(selected).toEqual(["B"]);
  });
  it("keeps the cursor independent of selection and announces positions", async () => {
    grid().focus();
    await press("Home");
    await press("ArrowDown", { ctrlKey: true });
    expect(selected).toEqual(["A"]);
    expect(grid().getAttribute("aria-activedescendant")).toBe(row("B").id);
    await press(" ", { ctrlKey: true });
    expect(selected).toEqual(["A", "B"]);
    await press("End");
    expect(selected).toEqual(["D"]);
    expect(row("D").getAttribute("aria-rowindex")).toBe("5");
    expect(grid().getAttribute("aria-rowcount")).toBe("5");
    expect(grid().getAttribute("aria-multiselectable")).toBe("true");
  });
});
