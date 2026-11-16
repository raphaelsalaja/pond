import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { DataTable, type TableColumn } from ".";

interface Save {
  id: string;
  title: string;
  source: string;
  saved: string;
}

const saves: Save[] = [
  { id: "one", title: "Grid Systems", source: "Are.na", saved: "Mar 2" },
  { id: "two", title: "Type Scale", source: "X", saved: "Mar 4" },
  { id: "three", title: "Motion Notes", source: "YouTube", saved: "Mar 9" },
];

const columns: TableColumn<Save>[] = [
  {
    id: "title",
    header: "Title",
    sortLabel: "Title",
    accessor: (save) => save.title,
    reorderable: true,
    cell: (save) => save.title,
  },
  {
    id: "source",
    header: "Source",
    sortLabel: "Source",
    accessor: (save) => save.source,
    reorderable: true,
    cell: (save) => save.source,
  },
  {
    id: "saved",
    header: "Saved",
    sortLabel: "Saved",
    accessor: (save) => save.saved,
    reorderable: true,
    cell: (save) => save.saved,
  },
];

async function renderTable() {
  const screen = await render(
    <DataTable.Provider
      data={saves}
      columns={columns}
      getRowId={(save) => save.id}
      height={200}
    >
      <DataTable.Root aria-label="Saves" />
    </DataTable.Provider>,
  );
  const headers = screen.getByRole("columnheader");
  const headerOrder = () =>
    headers.elements().map((header) => header.textContent);
  return { screen, headers, headerOrder };
}

describe("DataTable column reorder", () => {
  it("moves a focused column with Alt+ArrowRight and Alt+ArrowLeft", async () => {
    const { screen, headers, headerOrder } = await renderTable();
    const title = screen.getByRole("button", { name: "Sort by Title" });
    const node = title.element();
    if (!(node instanceof HTMLElement)) throw new Error("Missing sort button");
    node.focus();

    await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}");
    await expect.poll(headerOrder).toEqual(["Source", "Title", "Saved"]);
    await expect.element(title).toHaveFocus();

    await userEvent.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    await expect.poll(headerOrder).toEqual(["Title", "Source", "Saved"]);
    await expect.element(headers.nth(0)).toHaveAttribute("aria-sort", "none");
  });

  it("moves a column when its header is dragged past another", async () => {
    const { headers, headerOrder } = await renderTable();
    const source = headers.nth(0);
    const target = headers.nth(2);
    const from = source.element().getBoundingClientRect();
    const to = target.element().getBoundingClientRect();

    await userEvent.dragAndDrop(source, target, {
      sourcePosition: { x: from.width - 12, y: from.height / 2 },
      targetPosition: { x: to.width - 4, y: to.height / 2 },
      steps: 8,
    });

    await expect.poll(headerOrder).toEqual(["Source", "Saved", "Title"]);
    await expect.element(headers.nth(2)).toHaveAttribute("aria-sort", "none");
  });
});
