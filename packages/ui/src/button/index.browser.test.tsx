import { IconFolderPlus } from "@pond/icons";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { Button } from ".";

describe("Button keyboard", () => {
  it("takes focus with Tab and activates with Enter and Space", async () => {
    const onClick = vi.fn();
    const screen = await render(<Button onClick={onClick}>Save</Button>);
    const control = screen.getByRole("button", { name: "Save" });

    await userEvent.tab();
    await expect.element(control).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);

    await userEvent.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("names an icon button from its aria-label", async () => {
    const screen = await render(
      <Button icon variant="ghost" aria-label="New Folder">
        <IconFolderPlus />
      </Button>,
    );

    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "New Folder" }))
      .toHaveFocus();
  });

  it("skips disabled and loading buttons in the tab order", async () => {
    const screen = await render(
      <>
        <Button disabled>Delete</Button>
        <Button loading>Importing</Button>
        <button type="button">After</button>
      </>,
    );

    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "After" }))
      .toHaveFocus();
  });
});
