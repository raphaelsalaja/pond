import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { ContextMenu } from ".";
import { expectAccessible } from "../../test/axe";
import { Button } from "../button";

function FolderActions({ onSelect }: { onSelect?: (label: string) => void }) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={<Button variant="secondary" />}>
        Inspiration
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner>
          <ContextMenu.Popup>
            {["Rename", "Duplicate", "Move to Trash"].map((label) => (
              <ContextMenu.Item key={label} onClick={() => onSelect?.(label)}>
                <ContextMenu.ItemLabel>{label}</ContextMenu.ItemLabel>
              </ContextMenu.Item>
            ))}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

const item = (name: string) => page.getByRole("menuitem", { name });

describe("ContextMenu keyboard", () => {
  it("opens on right-click and moves with arrows", async () => {
    const screen = await render(<FolderActions />);
    await userEvent.click(screen.getByRole("button", { name: "Inspiration" }), {
      button: "right",
    });

    const menu = page.getByRole("menu");
    await expect.element(menu).toBeVisible();
    await expectAccessible();

    await userEvent.keyboard("{Home}");
    await expect.element(item("Rename")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(item("Duplicate")).toHaveFocus();
    await userEvent.keyboard("{End}");
    await expect.element(item("Move to Trash")).toHaveFocus();
  });

  it("runs the highlighted item with Enter", async () => {
    const selected: Array<string> = [];
    const screen = await render(
      <FolderActions onSelect={(label) => selected.push(label)} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Inspiration" }), {
      button: "right",
    });
    await expect.element(page.getByRole("menu")).toBeVisible();

    await userEvent.keyboard("{End}");
    await expect.element(item("Move to Trash")).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
    expect(selected).toEqual(["Move to Trash"]);
  });

  it("closes with Escape", async () => {
    const screen = await render(<FolderActions />);
    await userEvent.click(screen.getByRole("button", { name: "Inspiration" }), {
      button: "right",
    });
    await expect.element(page.getByRole("menu")).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
  });
});
