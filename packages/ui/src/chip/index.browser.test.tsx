import { IconTag } from "@pond/icons";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { Chip } from ".";
import { expectAccessible } from "../../test/axe";
import { Menu } from "../menu";

describe("Chip keyboard", () => {
  it("names Chip.Clear Remove by default and activates it from the keyboard", async () => {
    const onClick = vi.fn();
    const screen = await render(
      <Chip.Item tone="tag">
        <Chip.Label>Reference</Chip.Label>
        <Chip.Clear onClick={onClick} />
      </Chip.Item>,
    );

    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "Remove", exact: true }))
      .toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("opens a filter menu, closes it with Escape and clears with its own button", async () => {
    const onClear = vi.fn();
    await render(
      <Chip.Filter
        icon={<IconTag size={12} />}
        label="Reference"
        ariaLabel="Tag: Reference"
        active
        onClear={onClear}
      >
        <Chip.Popup aria-label="Tag Filter">
          <Menu.CheckboxItem checked>
            <Menu.CheckboxItemIndicator />
            <Menu.ItemLabel>Reference</Menu.ItemLabel>
          </Menu.CheckboxItem>
        </Chip.Popup>
      </Chip.Filter>,
    );
    const trigger = page.getByRole("button", { name: "Tag: Reference" });

    await userEvent.tab();
    await expect.element(trigger).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("menu", { name: "Tag Filter" }))
      .toBeVisible();
    await expectAccessible();

    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();

    await userEvent.tab();
    await expect
      .element(page.getByRole("button", { name: "Clear Filter" }))
      .toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
