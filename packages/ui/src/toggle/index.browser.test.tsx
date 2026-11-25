import { IconPinTack } from "@pond/icons";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { Toggle } from ".";

describe("Toggle keyboard", () => {
  it("takes focus with Tab and toggles with Space and Enter", async () => {
    const screen = await render(
      <Toggle icon aria-label="Pin Save">
        <IconPinTack size={16} />
      </Toggle>,
    );
    const control = screen.getByRole("button", { name: "Pin Save" });

    await userEvent.tab();
    await expect.element(control).toHaveFocus();
    await expect.element(control).toHaveAttribute("aria-pressed", "false");

    await userEvent.keyboard(" ");
    await expect.element(control).toHaveAttribute("aria-pressed", "true");

    await userEvent.keyboard("{Enter}");
    await expect.element(control).toHaveAttribute("aria-pressed", "false");
  });

  it("skips a disabled toggle in the tab order", async () => {
    const screen = await render(
      <>
        <Toggle disabled>Pinned</Toggle>
        <button type="button">After</button>
      </>,
    );

    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "After" }))
      .toHaveFocus();
  });
});
