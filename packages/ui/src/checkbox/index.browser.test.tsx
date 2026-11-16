import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Checkbox } from ".";

describe("Checkbox keyboard", () => {
  it("takes its name from a label and toggles with Space", async () => {
    const screen = await render(
      <>
        <Checkbox.Root id="sync-folders">
          <Checkbox.Indicator />
        </Checkbox.Root>
        <label htmlFor="sync-folders">Sync Folders</label>
      </>,
    );
    const control = screen.getByRole("checkbox", { name: "Sync Folders" });

    await userEvent.tab();
    await expect.element(control).toHaveFocus();
    await expect.element(control).toHaveAttribute("aria-checked", "false");

    await userEvent.keyboard(" ");
    await expect.element(control).toHaveAttribute("aria-checked", "true");

    await userEvent.keyboard(" ");
    await expect.element(control).toHaveAttribute("aria-checked", "false");
  });

  it("reports a mixed state", async () => {
    const screen = await render(
      <Checkbox.Root aria-label="Select All Saves" indeterminate>
        <Checkbox.Indicator />
      </Checkbox.Root>,
    );

    await expect
      .element(screen.getByRole("checkbox", { name: "Select All Saves" }))
      .toHaveAttribute("aria-checked", "mixed");
  });

  it("skips a disabled checkbox in the tab order", async () => {
    const screen = await render(
      <>
        <Checkbox.Root aria-label="Sync Folders" disabled />
        <button type="button">After</button>
      </>,
    );

    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "After" }))
      .toHaveFocus();
  });
});
