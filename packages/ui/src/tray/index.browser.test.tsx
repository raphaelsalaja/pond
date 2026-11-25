import { IconArrowDown, IconArrowUp, IconShare } from "@pond/icons";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { Tray } from ".";

async function renderTray(orientation: "horizontal" | "vertical") {
  const screen = await render(
    <>
      <Tray.Pill aria-label="Save Actions" orientation={orientation}>
        <Tray.Item aria-label="Previous Save">
          <IconArrowUp />
        </Tray.Item>
        <Tray.Item aria-label="Next Save">
          <IconArrowDown />
        </Tray.Item>
        <Tray.Separator />
        <Tray.Item aria-label="Share" disabled>
          <IconShare />
        </Tray.Item>
      </Tray.Pill>
      <button type="button">After</button>
    </>,
  );
  return {
    toolbar: screen.getByRole("toolbar", { name: "Save Actions" }),
    previous: screen.getByRole("button", { name: "Previous Save" }),
    next: screen.getByRole("button", { name: "Next Save" }),
    share: screen.getByRole("button", { name: "Share" }),
    after: screen.getByRole("button", { name: "After" }),
  };
}

describe("Tray keyboard", () => {
  it("exposes toolbar semantics", async () => {
    const { toolbar } = await renderTray("horizontal");
    await expect
      .element(toolbar)
      .toHaveAttribute("aria-orientation", "horizontal");
  });

  it("leaves a pill of plain controls as a surface inside a host toolbar", async () => {
    const screen = await render(
      <div role="toolbar" aria-label="Viewer">
        <Tray.Pill>
          <button type="button">Rotate</button>
          <button type="button">Mirror</button>
        </Tray.Pill>
      </div>,
    );
    expect(screen.getByRole("toolbar").elements()).toHaveLength(1);

    await userEvent.tab();
    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "Mirror" }))
      .toHaveFocus();
  });

  it("takes one tab stop and moves between items with arrows", async () => {
    const { previous, next, share, after } = await renderTray("horizontal");

    await userEvent.tab();
    await expect.element(previous).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(next).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(share).toHaveFocus();
    await expect.element(share).toHaveAttribute("aria-disabled", "true");

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(previous).toHaveFocus();

    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(share).toHaveFocus();

    await userEvent.tab();
    await expect.element(after).toHaveFocus();
  });

  it("returns to the last focused item on Tab back in", async () => {
    const { next, after } = await renderTray("horizontal");

    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(next).toHaveFocus();

    await userEvent.tab();
    await expect.element(after).toHaveFocus();

    await userEvent.tab({ shift: true });
    await expect.element(next).toHaveFocus();
  });

  it("jumps to the first and last item with Home and End", async () => {
    const { previous, share } = await renderTray("horizontal");

    await userEvent.tab();
    await userEvent.keyboard("{End}");
    await expect.element(share).toHaveFocus();

    await userEvent.keyboard("{Home}");
    await expect.element(previous).toHaveFocus();
  });

  it("uses vertical arrows in a vertical pill", async () => {
    const { previous, next } = await renderTray("vertical");

    await userEvent.tab();
    await expect.element(previous).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(previous).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");
    await expect.element(next).toHaveFocus();

    await userEvent.keyboard("{ArrowUp}");
    await expect.element(previous).toHaveFocus();
  });
});
