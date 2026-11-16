import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Switch } from ".";

describe("Switch keyboard", () => {
  it("takes focus with Tab and toggles with Space", async () => {
    const screen = await render(<Switch.Root aria-label="Play Sounds" />);
    const control = screen.getByRole("switch", { name: "Play Sounds" });

    await userEvent.tab();
    await expect.element(control).toHaveFocus();
    await expect.element(control).toHaveAttribute("aria-checked", "false");

    await userEvent.keyboard(" ");
    await expect.element(control).toHaveAttribute("aria-checked", "true");
  });

  it("skips a disabled switch in the tab order", async () => {
    const screen = await render(
      <>
        <Switch.Root aria-label="Sync Folders" disabled />
        <button type="button">After</button>
      </>,
    );

    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "After" }))
      .toHaveFocus();
  });
});
