import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { Combobox } from ".";
import { expectAccessible } from "../../test/axe";

const TAGS = ["Reference", "Design", "Typography", "Moodboard"];

function TagField({
  defaultValue = [],
  disabled,
}: {
  defaultValue?: Array<string>;
  disabled?: boolean;
}) {
  return (
    <Combobox.Root
      multiple
      items={TAGS}
      defaultValue={defaultValue}
      disabled={disabled}
    >
      <Combobox.InputGroup>
        <Combobox.Value>
          {(selected: Array<string>) => (
            <Combobox.Chips>
              {selected.map((tag) => (
                <Combobox.Chip key={tag}>
                  {tag}
                  <Combobox.ChipRemove />
                </Combobox.Chip>
              ))}
              <Combobox.ChipsInput aria-label="Tags" />
            </Combobox.Chips>
          )}
        </Combobox.Value>
      </Combobox.InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner>
          <Combobox.Popup>
            <Combobox.List>
              {(tag: string) => (
                <Combobox.Item key={tag} value={tag}>
                  <Combobox.ItemLabel>{tag}</Combobox.ItemLabel>
                  <Combobox.ItemIndicator />
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

describe("Combobox keyboard", () => {
  it("filters, picks with Enter and closes with Escape", async () => {
    await render(<TagField />);
    const input = page.getByRole("combobox", { name: "Tags" });

    await userEvent.tab();
    await expect.element(input).toHaveFocus();

    await userEvent.keyboard("Typ");
    await expect
      .element(page.getByRole("option", { name: "Typography" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("option", { name: "Design" }))
      .not.toBeInTheDocument();
    await expectAccessible();

    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("button", { name: "Remove" }))
      .toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
    await expect.element(input).toHaveFocus();
  });

  it("names ChipRemove Remove by default", async () => {
    await render(<TagField defaultValue={["Design"]} />);
    const remove = page.getByRole("button", { name: "Remove", exact: true });

    await expect.element(remove).toBeInTheDocument();
    await remove.click();
    await expect.element(remove).not.toBeInTheDocument();
  });

  it("skips a disabled combobox in the tab order", async () => {
    await render(
      <>
        <TagField disabled />
        <button type="button">After</button>
      </>,
    );

    await userEvent.tab();
    await expect
      .element(page.getByRole("button", { name: "After" }))
      .toHaveFocus();
  });
});
