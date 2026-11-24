import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { Select } from ".";
import { expectAccessible } from "../../test/axe";

const SORT = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "title", label: "Title" },
];

function SortSelect({ disabled }: { disabled?: boolean }) {
  return (
    <Select.Root items={SORT} defaultValue="newest" disabled={disabled}>
      <Select.Trigger aria-label="Sort Saves">
        <Select.Value />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner>
          <Select.Popup>
            <Select.Items items={SORT} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

const trigger = () => page.getByRole("combobox", { name: "Sort Saves" });

describe("Select keyboard", () => {
  it("opens with Enter, picks with arrows and Enter, and returns focus", async () => {
    await render(<SortSelect />);

    await userEvent.tab();
    await expect.element(trigger()).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("listbox")).toBeVisible();
    await expect
      .element(page.getByRole("option", { name: "Newest First" }))
      .toHaveAttribute("aria-selected", "true");
    await expectAccessible();

    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");

    await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
    await expect.element(trigger()).toHaveFocus();
    await expect.element(trigger()).toHaveTextContent("Oldest First");
  });

  it("closes with Escape without changing the value", async () => {
    await render(<SortSelect />);

    await userEvent.tab();
    await userEvent.keyboard(" ");
    await expect.element(page.getByRole("listbox")).toBeVisible();

    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Escape}");

    await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
    await expect.element(trigger()).toHaveFocus();
    await expect.element(trigger()).toHaveTextContent("Newest First");
  });

  it("skips a disabled select in the tab order", async () => {
    await render(
      <>
        <SortSelect disabled />
        <button type="button">After</button>
      </>,
    );

    await userEvent.tab();
    await expect
      .element(page.getByRole("button", { name: "After" }))
      .toHaveFocus();
  });
});
