import { IconFolderPlus, IconTrash } from "@pond/icons";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectAccessible } from "../../test/axe";
import { Button } from "../button";
import { Tooltip } from ".";

describe("Tooltip keyboard", () => {
  it("shows on keyboard focus and hides with Escape", async () => {
    const screen = await render(
      <Tooltip label="Create a folder" shortcut="⌘N">
        <Button icon variant="ghost" aria-label="New Folder">
          <IconFolderPlus />
        </Button>
      </Tooltip>,
    );
    const trigger = screen.getByRole("button", { name: "New Folder" });
    const hint = page.getByText("Create a folder");

    await userEvent.tab();
    await expect.element(trigger).toHaveFocus();
    await expect.element(hint).toBeVisible();
    await expect.element(trigger).toHaveAccessibleName("New Folder");
    await expectAccessible();

    await userEvent.keyboard("{Escape}");
    await expect.element(hint).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
  });

  it("works as a compound with the same behavior", async () => {
    const screen = await render(
      <Tooltip.Root>
        <Tooltip.Trigger
          render={<Button icon variant="ghost" aria-label="Move to Trash" />}
        >
          <IconTrash />
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner>
            <Tooltip.Popup>
              {Tooltip.Label("Saves stay for 30 days")}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>,
    );
    const trigger = screen.getByRole("button", { name: "Move to Trash" });
    const hint = page.getByText("Saves stay for 30 days");

    await userEvent.tab();
    await expect.element(hint).toBeVisible();
    await expect.element(trigger).toHaveAccessibleName("Move to Trash");
    await expectAccessible();

    await userEvent.keyboard("{Escape}");
    await expect.element(hint).not.toBeInTheDocument();
  });

  it("names the info button and explains on focus", async () => {
    const screen = await render(
      <Tooltip.Info label="Pond checks each source every hour." />,
    );
    const trigger = screen.getByRole("button", { name: "More Information" });

    await userEvent.tab();
    await expect.element(trigger).toHaveFocus();
    await expect
      .element(page.getByText("Pond checks each source every hour."))
      .toBeVisible();
    await expectAccessible();
  });
});
