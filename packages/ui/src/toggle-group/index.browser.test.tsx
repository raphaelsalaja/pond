import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { ToggleGroup } from ".";
import { Toggle } from "../toggle";

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

  it("stacks the list variant and roves focus with Up and Down", async () => {
    const screen = await render(
      <ToggleGroup aria-label="Template" variant="list" defaultValue={["a"]}>
        <Toggle value="a">Research</Toggle>
        <Toggle value="b">Design Project</Toggle>
      </ToggleGroup>,
    );
    const toggle = (name: string) => screen.getByRole("button", { name });

    await expect
      .element(screen.getByRole("group", { name: "Template" }))
      .toHaveAttribute("data-orientation", "vertical");
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(toggle("Design Project")).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    await expect.element(toggle("Research")).toHaveFocus();
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
