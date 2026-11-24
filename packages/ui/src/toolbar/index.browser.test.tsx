import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { Toolbar } from ".";
import { Button } from "../button";

async function setup() {
  const screen = await render(
    <>
      <button type="button">Before</button>
      <Toolbar.Root aria-label="Library">
        <Toolbar.Row>
          <Toolbar.Group aria-label="Find">
            <Toolbar.Button render={<Button size="sm" variant="ghost" />}>
              Search
            </Toolbar.Button>
            <Toolbar.Button render={<Button size="sm" variant="ghost" />}>
              Filter
            </Toolbar.Button>
          </Toolbar.Group>
          <Toolbar.Separator />
          <Toolbar.Group fill align="end">
            <Toolbar.Button render={<Button size="sm" variant="secondary" />}>
              New Folder
            </Toolbar.Button>
          </Toolbar.Group>
        </Toolbar.Row>
      </Toolbar.Root>
      <button type="button">After</button>
    </>,
  );
  const button = (name: string) => screen.getByRole("button", { name });
  await userEvent.click(button("Before"));
  await userEvent.tab();
  return { button, screen };
}

describe("Toolbar keyboard", () => {
  it("names the toolbar and enters it on the first control", async () => {
    const { button, screen } = await setup();

    await expect
      .element(screen.getByRole("toolbar", { name: "Library" }))
      .toHaveAttribute("aria-orientation", "horizontal");
    await expect.element(button("Search")).toHaveFocus();
  });

  it("moves focus across groups with the arrows", async () => {
    const { button } = await setup();

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(button("Filter")).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(button("New Folder")).toHaveFocus();

    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(button("Filter")).toHaveFocus();
  });

  it("wraps at both ends", async () => {
    const { button } = await setup();

    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(button("New Folder")).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(button("Search")).toHaveFocus();
  });

  it("is one tab stop that remembers the last focused control", async () => {
    const { button } = await setup();

    await userEvent.keyboard("{ArrowRight}");
    await userEvent.tab();
    await expect.element(button("After")).toHaveFocus();

    await userEvent.tab({ shift: true });
    await expect.element(button("Filter")).toHaveFocus();
  });
});
