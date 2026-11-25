import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { Accordion } from ".";

async function setup() {
  const screen = await render(
    <Accordion.Root>
      <Accordion.Item value="details">
        <Accordion.Header>
          <Accordion.Trigger>Details</Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel>Saved from Are.na</Accordion.Panel>
      </Accordion.Item>
      <Accordion.Item value="tags">
        <Accordion.Header>
          <Accordion.Trigger>Tags</Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel>Typography, Posters</Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>,
  );
  const trigger = (name: string) => screen.getByRole("button", { name });
  return { screen, trigger };
}

describe("Accordion keyboard", () => {
  it("moves between triggers with Tab", async () => {
    const { trigger } = await setup();

    await userEvent.tab();
    await expect.element(trigger("Details")).toHaveFocus();

    await userEvent.tab();
    await expect.element(trigger("Tags")).toHaveFocus();
  });

  it("opens and closes a section with Enter", async () => {
    const { screen, trigger } = await setup();

    await userEvent.tab();
    await expect
      .element(trigger("Details"))
      .toHaveAttribute("aria-expanded", "false");

    await userEvent.keyboard("{Enter}");
    await expect
      .element(trigger("Details"))
      .toHaveAttribute("aria-expanded", "true");
    await expect
      .element(screen.getByRole("region", { name: "Details" }))
      .toHaveTextContent("Saved from Are.na");

    await userEvent.keyboard("{Enter}");
    await expect
      .element(trigger("Details"))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("opens a section with Space and closes the other one", async () => {
    const { trigger } = await setup();

    await userEvent.tab();
    await userEvent.keyboard(" ");
    await expect
      .element(trigger("Details"))
      .toHaveAttribute("aria-expanded", "true");

    await userEvent.tab();
    await expect.element(trigger("Tags")).toHaveFocus();
    await userEvent.keyboard(" ");

    await expect
      .element(trigger("Tags"))
      .toHaveAttribute("aria-expanded", "true");
    await expect
      .element(trigger("Details"))
      .toHaveAttribute("aria-expanded", "false");
  });
});
