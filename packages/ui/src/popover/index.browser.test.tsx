import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectAccessible } from "../../test/axe";
import { Button } from "../button";
import { Popover } from ".";

function SourceDetails() {
  return (
    <Popover.Root>
      <Popover.Trigger render={<Button variant="secondary" />}>
        Source Details
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner>
          <Popover.Popup>
            <Popover.Title>Are.na</Popover.Title>
            <Popover.Description>
              Pond fetches new blocks every hour.
            </Popover.Description>
            <Popover.Close render={<Button size="sm" variant="secondary" />}>
              Done
            </Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

describe("Popover keyboard", () => {
  it("opens with Enter, focuses inside, and closes with Escape", async () => {
    const screen = await render(<SourceDetails />);
    const trigger = screen.getByRole("button", { name: "Source Details" });

    await userEvent.tab();
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.keyboard("{Enter}");

    const popup = page.getByRole("dialog", { name: "Are.na" });
    await expect.element(popup).toBeVisible();
    await expect
      .element(popup)
      .toHaveAccessibleDescription("Pond fetches new blocks every hour.");
    await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
    await expect
      .element(page.getByRole("button", { name: "Done" }))
      .toHaveFocus();
    await expectAccessible();

    await userEvent.keyboard("{Escape}");
    await expect.element(popup).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
  });

  it("opens with Space and closes from Popover.Close", async () => {
    const screen = await render(<SourceDetails />);
    const trigger = screen.getByRole("button", { name: "Source Details" });

    await userEvent.tab();
    await userEvent.keyboard(" ");
    await expect.element(page.getByRole("dialog")).toBeVisible();

    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
  });
});
