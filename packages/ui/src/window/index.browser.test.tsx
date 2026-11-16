import { useState } from "react";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { cssVars } from "../css-vars";
import { Window } from ".";

function Panes() {
  const [width, setWidth] = useState(240);
  return (
    <Window.Root
      leftOpen
      style={{
        ...cssVars({ "--window-left-track": `${width}px` }),
        height: 240,
      }}
    >
      <Window.Left
        aria-label="Sidebar"
        minWidth={200}
        maxWidth={320}
        width={width}
        onResize={setWidth}
      >
        Sidebar
      </Window.Left>
      <Window.Center>Content</Window.Center>
    </Window.Root>
  );
}

async function setup() {
  const screen = await render(<Panes />);
  const separator = screen.getByRole("separator", { name: "Resize Sidebar" });
  return { screen, separator };
}

describe("Window resize handle", () => {
  it("takes focus with Tab as a vertical separator", async () => {
    const { separator } = await setup();

    await userEvent.tab();
    await expect.element(separator).toHaveFocus();
    await expect
      .element(separator)
      .toHaveAttribute("aria-orientation", "vertical");
    await expect.element(separator).toHaveAttribute("aria-valuenow", "240");
  });

  it("steps the width with ArrowLeft and ArrowRight", async () => {
    const { separator } = await setup();

    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(separator).toHaveAttribute("aria-valuenow", "250");
    await userEvent.keyboard("{ArrowLeft}");
    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(separator).toHaveAttribute("aria-valuenow", "230");
    await userEvent.keyboard("{Shift>}{ArrowRight}{/Shift}");
    await expect.element(separator).toHaveAttribute("aria-valuenow", "270");
  });

  it("jumps to the minimum with Home and the maximum with End", async () => {
    const { separator } = await setup();

    await userEvent.tab();
    await userEvent.keyboard("{Home}");
    await expect.element(separator).toHaveAttribute("aria-valuenow", "200");
    await userEvent.keyboard("{End}");
    await expect.element(separator).toHaveAttribute("aria-valuenow", "320");
  });

  it("changes the width with a pointer drag", async () => {
    const { screen, separator } = await setup();

    await userEvent.dragAndDrop(separator, screen.getByText("Content"), {
      targetPosition: { x: 60, y: 20 },
    });
    await expect
      .poll(() => Number(separator.element().getAttribute("aria-valuenow")))
      .toBeGreaterThan(240);
  });
});
