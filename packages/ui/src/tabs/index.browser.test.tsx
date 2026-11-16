import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Tabs } from ".";

async function setup() {
  const screen = await render(
    <>
      <button type="button">Before</button>
      <Tabs.Root defaultValue="details">
        <Tabs.List aria-label="Fish Views">
          <Tabs.Tab value="details">Details</Tabs.Tab>
          <Tabs.Tab value="library">Library</Tabs.Tab>
          <Tabs.Tab value="activity">Activity</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="details">Details panel</Tabs.Panel>
        <Tabs.Panel value="library">Library panel</Tabs.Panel>
        <Tabs.Panel value="activity">Activity panel</Tabs.Panel>
      </Tabs.Root>
    </>,
  );
  const tab = (name: string) => screen.getByRole("tab", { name });
  await userEvent.click(screen.getByRole("button", { name: "Before" }));
  await userEvent.tab();
  return { screen, tab };
}

describe("Tabs keyboard", () => {
  it("lands on the selected tab when tabbing in", async () => {
    const { screen, tab } = await setup();

    await expect.element(tab("Details")).toHaveFocus();
    await expect
      .element(tab("Details"))
      .toHaveAttribute("aria-selected", "true");
    await expect
      .element(screen.getByRole("tablist", { name: "Fish Views" }))
      .toBeVisible();
  });

  it("moves focus with the arrows without changing the selection", async () => {
    const { tab } = await setup();

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(tab("Library")).toHaveFocus();
    await expect
      .element(tab("Details"))
      .toHaveAttribute("aria-selected", "true");
    await expect
      .element(tab("Library"))
      .toHaveAttribute("aria-selected", "false");

    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(tab("Details")).toHaveFocus();
  });

  it("wraps at both ends", async () => {
    const { tab } = await setup();

    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(tab("Activity")).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(tab("Details")).toHaveFocus();
  });

  it("jumps to the first and last tab with Home and End", async () => {
    const { tab } = await setup();

    await userEvent.keyboard("{End}");
    await expect.element(tab("Activity")).toHaveFocus();

    await userEvent.keyboard("{Home}");
    await expect.element(tab("Details")).toHaveFocus();
  });

  it("selects the focused tab with Enter and shows its panel", async () => {
    const { screen, tab } = await setup();

    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{Enter}");

    await expect
      .element(tab("Library"))
      .toHaveAttribute("aria-selected", "true");
    await expect
      .element(tab("Details"))
      .toHaveAttribute("aria-selected", "false");
    await expect.element(screen.getByText("Library panel")).toBeVisible();
  });

  it("selects the focused tab with Space", async () => {
    const { screen, tab } = await setup();

    await userEvent.keyboard("{End}");
    await userEvent.keyboard(" ");

    await expect
      .element(tab("Activity"))
      .toHaveAttribute("aria-selected", "true");
    await expect.element(screen.getByText("Activity panel")).toBeVisible();
  });

  it("keeps one tab stop and moves on to the panel", async () => {
    const { screen } = await setup();

    await userEvent.tab();
    await expect
      .element(screen.getByRole("tabpanel", { name: "Details" }))
      .toHaveFocus();
  });
});
