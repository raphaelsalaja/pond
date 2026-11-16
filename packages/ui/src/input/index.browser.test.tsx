import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Input } from ".";

describe("Input keyboard", () => {
  it("takes focus with Tab and edits its value", async () => {
    const screen = await render(
      <Input.Root>
        <Input.Prefix>https://</Input.Prefix>
        <Input.Field aria-label="Source URL" />
      </Input.Root>,
    );
    const field = screen.getByRole("textbox", { name: "Source URL" });

    await userEvent.tab();
    await expect.element(field).toHaveFocus();

    await userEvent.keyboard("are.na");
    await expect.element(field).toHaveValue("are.na");
  });

  it("moves from the field to the textarea with Tab", async () => {
    const screen = await render(
      <>
        <Input.Root>
          <Input.Field aria-label="Title" />
        </Input.Root>
        <Input.Root>
          <Input.Textarea aria-label="Note" />
        </Input.Root>
      </>,
    );

    await userEvent.tab();
    await userEvent.tab();
    const note = screen.getByRole("textbox", { name: "Note" });
    await expect.element(note).toHaveFocus();

    await userEvent.keyboard("First line{Enter}Second line");
    await expect.element(note).toHaveValue("First line\nSecond line");
  });

  it("skips a disabled field in the tab order", async () => {
    const screen = await render(
      <>
        <Input.Root>
          <Input.Field aria-label="Library Name" disabled />
        </Input.Root>
        <button type="button">After</button>
      </>,
    );

    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "After" }))
      .toHaveFocus();
  });
});
