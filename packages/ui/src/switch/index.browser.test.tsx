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

  it("dims while disabled and ignores hover", async () => {
    const still = { transition: "none" };
    const screen = await render(
      <>
        <Switch.Root aria-label="Play Sounds" checked style={still} />
        <Switch.Root aria-label="Sync Folders" checked disabled style={still} />
      </>,
    );
    const element = (name: string) =>
      screen.getByRole("switch", { name }).element();
    const background = (name: string) =>
      getComputedStyle(element(name)).backgroundColor;

    expect(getComputedStyle(element("Sync Folders")).opacity).not.toBe("1");

    const enabled = background("Play Sounds");
    await userEvent.hover(element("Play Sounds"));
    expect(background("Play Sounds")).not.toBe(enabled);

    const disabled = background("Sync Folders");
    await userEvent.hover(element("Sync Folders"));
    expect(background("Sync Folders")).toBe(disabled);
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
