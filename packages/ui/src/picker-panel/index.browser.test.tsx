import { useMemo, useState } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { PickerPanel, usePickerCursor } from ".";

const FOLDERS = ["Inbox", "Design", "Recipes", "Reading List", "Travel"];
const folderId = (name: string) => name;

function Folders({ onActivate }: { onActivate: (name: string) => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlyArray<string>>([]);
  const folders = useMemo(
    () =>
      FOLDERS.filter((name) =>
        name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [query],
  );
  const cursor = usePickerCursor({
    items: folders,
    getId: folderId,
    onActivate: (name) => {
      onActivate(name);
      setSelected((current) => [...current, name]);
    },
  });

  return (
    <PickerPanel.Surface>
      <PickerPanel.Header>
        <PickerPanel.Search
          {...cursor.inputProps}
          aria-label="Search Folders"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </PickerPanel.Header>
      <PickerPanel.Collection
        id={cursor.collectionId}
        aria-label="Folders"
        aria-multiselectable
      >
        {folders.map((name) => (
          <PickerPanel.Item
            key={name}
            {...cursor.getItemProps(name)}
            selected={selected.includes(name) ? "checked" : "unchecked"}
          >
            <PickerPanel.ItemLabel>{name}</PickerPanel.ItemLabel>
          </PickerPanel.Item>
        ))}
      </PickerPanel.Collection>
    </PickerPanel.Surface>
  );
}

async function setup() {
  const activated: Array<string> = [];
  const screen = await render(
    <Folders onActivate={(name) => activated.push(name)} />,
  );
  const input = screen.getByRole("combobox", { name: "Search Folders" });
  const option = (name: string) =>
    screen.getByRole("option", { name, exact: true });
  const expectHighlighted = async (name: string) => {
    const id = option(name).element().id;
    expect(id).not.toBe("");
    await expect.element(input).toHaveAttribute("aria-activedescendant", id);
    await expect.element(option(name)).toHaveAttribute("data-highlighted");
  };
  await userEvent.click(input);
  return { activated, expectHighlighted, input, option, screen };
}

describe("PickerPanel keyboard", () => {
  it("names the search field and its listbox", async () => {
    const { input, screen } = await setup();

    await expect.element(input).toHaveAttribute("aria-autocomplete", "list");
    await expect
      .element(screen.getByRole("listbox", { name: "Folders" }))
      .toBeVisible();
  });

  it("moves the highlight with the arrows while focus stays in the search field", async () => {
    const { expectHighlighted, input, option } = await setup();

    await expectHighlighted("Inbox");

    await userEvent.keyboard("{ArrowDown}");
    await expectHighlighted("Design");
    await expect
      .element(option("Inbox"))
      .not.toHaveAttribute("data-highlighted");
    await expect.element(input).toHaveFocus();

    await userEvent.keyboard("{ArrowUp}");
    await expectHighlighted("Inbox");

    await userEvent.keyboard("{ArrowUp}");
    await expectHighlighted("Travel");
    await expect.element(input).toHaveFocus();
  });

  it("leaves Home and End to the search field's caret", async () => {
    const { expectHighlighted } = await setup();

    await userEvent.keyboard("{ArrowDown}");
    await expectHighlighted("Design");
    await userEvent.keyboard("{End}");
    await expectHighlighted("Design");
    await userEvent.keyboard("{Home}");
    await expectHighlighted("Design");
  });

  it("filters as you type and highlights the first match", async () => {
    const { expectHighlighted, screen } = await setup();

    await userEvent.keyboard("{ArrowUp}");
    await expectHighlighted("Travel");
    await userEvent.keyboard("re");

    await expect.poll(() => screen.getByRole("option").all().length).toBe(2);
    await expectHighlighted("Recipes");
  });

  it("activates the highlighted option with Enter and reports it selected", async () => {
    const { activated, expectHighlighted, option } = await setup();

    await expect
      .element(option("Design"))
      .toHaveAttribute("aria-selected", "false");
    await userEvent.keyboard("{ArrowDown}");
    await expectHighlighted("Design");
    await userEvent.keyboard("{Enter}");

    expect(activated).toEqual(["Design"]);
    await expect
      .element(option("Design"))
      .toHaveAttribute("aria-selected", "true");
    await expectHighlighted("Design");
  });
});
