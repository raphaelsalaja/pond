import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Toggle } from "../toggle";
import { ToggleGroup } from ".";

describe("ToggleGroup keyboard", () => {
  it("roves focus with arrows, Home and End and presses with Space", async () => {
    const screen = await render(
      <>
        <ToggleGroup aria-label="Layout" defaultValue={["grid"]}>
          <Toggle value="grid">Grid</Toggle>
          <Toggle value="list">List</Toggle>
          <Toggle value="table">Table</Toggle>
        </ToggleGroup>
        <button type="button">After</button>
      </>,
    );
    const toggle = (name: string) => screen.getByRole("button", { name });

    await userEvent.tab();
    await expect.element(toggle("Grid")).toHaveFocus();
    await expect
      .element(toggle("Grid"))
      .toHaveAttribute("aria-pressed", "true");

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(toggle("List")).toHaveFocus();

    await userEvent.keyboard(" ");
    await expect
      .element(toggle("List"))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(toggle("Grid"))
      .toHaveAttribute("aria-pressed", "false");

    await userEvent.keyboard("{End}");
    await expect.element(toggle("Table")).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(toggle("Grid")).toHaveFocus();

    await userEvent.keyboard("{End}");
    await userEvent.keyboard("{Home}");
    await expect.element(toggle("Grid")).toHaveFocus();

    await userEvent.tab();
    await expect.element(toggle("After")).toHaveFocus();
  });

  it("skips a disabled group in the tab order", async () => {
    const screen = await render(
      <>
        <ToggleGroup aria-label="Layout" defaultValue={["grid"]} disabled>
          <Toggle value="grid">Grid</Toggle>
          <Toggle value="list">List</Toggle>
        </ToggleGroup>
        <button type="button">After</button>
      </>,
    );

    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "After" }))
      .toHaveFocus();
  });
});
