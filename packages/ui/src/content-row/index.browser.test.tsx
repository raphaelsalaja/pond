import { IconDots } from "@pond/icons";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ContentRow } from ".";

async function setup() {
  const opened: string[] = [];
  const screen = await render(
    <ContentRow.Root>
      <ContentRow.Trigger onClick={() => opened.push("Design")}>
        <ContentRow.Content>
          <ContentRow.Title>Design</ContentRow.Title>
          <ContentRow.Description>128 saves</ContentRow.Description>
        </ContentRow.Content>
      </ContentRow.Trigger>
      <ContentRow.Action
        aria-label="More Options"
        onClick={() => opened.push("More Options")}
      >
        <IconDots />
      </ContentRow.Action>
    </ContentRow.Root>,
  );
  const trigger = screen.getByRole("button", { name: /^Design/ });
  const action = screen.getByRole("button", { name: "More Options" });
  return { action, opened, trigger };
}

describe("ContentRow keyboard", () => {
  it("renders the trigger as a native button", async () => {
    const { trigger } = await setup();

    await expect.element(trigger).toHaveAttribute("type", "button");
  });

  it("moves from the trigger to the action with Tab", async () => {
    const { action, trigger } = await setup();

    await userEvent.tab();
    await expect.element(trigger).toHaveFocus();

    await userEvent.tab();
    await expect.element(action).toHaveFocus();
  });

  it("opens the row with Enter and Space", async () => {
    const { opened } = await setup();

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");

    expect(opened).toEqual(["Design", "Design"]);
  });

  it("runs the action with Enter without opening the row", async () => {
    const { opened } = await setup();

    await userEvent.tab();
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");

    expect(opened).toEqual(["More Options"]);
  });
});
