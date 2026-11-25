import { IconDots } from "@pond/icons";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { Menu } from ".";
import { expectAccessible } from "../../test/axe";

function SaveActions({ onSelect }: { onSelect?: (label: string) => void }) {
  return (
    <Menu.Root>
      <Menu.Trigger icon variant="ghost" aria-label="Save Actions">
        <IconDots />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner>
          <Menu.Popup>
            {["Rename", "Duplicate", "Move to Trash"].map((label) => (
              <Menu.Item key={label} onClick={() => onSelect?.(label)}>
                <Menu.ItemLabel>{label}</Menu.ItemLabel>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

const item = (name: string) => page.getByRole("menuitem", { name });

async function setup() {
  const selected: Array<string> = [];
  const screen = await render(
    <SaveActions onSelect={(label) => selected.push(label)} />,
  );
  const trigger = screen.getByRole("button", { name: "Save Actions" });
  await userEvent.tab();
  await expect.element(trigger).toHaveFocus();
  return { selected, trigger };
}

describe("Menu keyboard", () => {
  it.each([
    ["Enter", "{Enter}"],
    ["Space", " "],
    ["ArrowDown", "{ArrowDown}"],
  ])("opens with %s and focuses the first item", async (_, key) => {
    const { trigger } = await setup();
    await expect.element(trigger).toHaveAttribute("aria-haspopup", "menu");

    await userEvent.keyboard(key);
    await expect.element(page.getByRole("menu")).toBeVisible();
    await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
    await expect.element(item("Rename")).toHaveFocus();
    await expectAccessible();
  });

  it("moves with arrows, Home and End", async () => {
    await setup();
    await userEvent.keyboard("{Enter}");
    await expect.element(item("Rename")).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");
    await expect.element(item("Duplicate")).toHaveFocus();
    await userEvent.keyboard("{End}");
    await expect.element(item("Move to Trash")).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    await expect.element(item("Duplicate")).toHaveFocus();
    await userEvent.keyboard("{Home}");
    await expect.element(item("Rename")).toHaveFocus();
  });

  it("jumps to an item by its first letter", async () => {
    await setup();
    await userEvent.keyboard("{Enter}");
    await expect.element(item("Rename")).toHaveFocus();

    await userEvent.keyboard("m");
    await expect.element(item("Move to Trash")).toHaveFocus();
  });

  it("closes with Escape and returns focus to the trigger", async () => {
    const { trigger } = await setup();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("menu")).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
  });

  it("runs an item with Enter and closes", async () => {
    const { selected, trigger } = await setup();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(item("Duplicate")).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
    expect(selected).toEqual(["Duplicate"]);
    await expect.element(trigger).toHaveFocus();
  });
});
