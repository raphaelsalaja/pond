import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { Field } from ".";
import { Input } from "../input";

describe("Field keyboard", () => {
  it("names and describes its control", async () => {
    const screen = await render(
      <Field.Root>
        <Field.Label>Library Name</Field.Label>
        <Input.Root>
          <Input.Field defaultValue="Pond" />
        </Input.Root>
        <Field.Description>Shown in the sidebar.</Field.Description>
      </Field.Root>,
    );
    const control = screen.getByRole("textbox", { name: "Library Name" });

    await userEvent.tab();
    await expect.element(control).toHaveFocus();
    await expect
      .element(control)
      .toHaveAccessibleDescription("Shown in the sidebar.");
  });

  it("focuses the control when the label is clicked", async () => {
    const screen = await render(
      <Field.Root>
        <Field.Label>Folder Name</Field.Label>
        <Input.Root>
          <Input.Field />
        </Input.Root>
      </Field.Root>,
    );

    await screen.getByText("Folder Name").click();
    await expect
      .element(screen.getByRole("textbox", { name: "Folder Name" }))
      .toHaveFocus();
  });

  it("marks an invalid control and shows its error", async () => {
    const screen = await render(
      <Field.Root invalid>
        <Field.Label>Folder Name</Field.Label>
        <Input.Root>
          <Input.Field />
        </Input.Root>
        <Field.Error match>Enter a folder name.</Field.Error>
      </Field.Root>,
    );
    const control = screen.getByRole("textbox", { name: "Folder Name" });

    await expect.element(control).toHaveAttribute("aria-invalid", "true");
    await expect
      .element(control)
      .toHaveAccessibleDescription("Enter a folder name.");
  });

  it("skips a disabled field in the tab order", async () => {
    const screen = await render(
      <>
        <Field.Root disabled>
          <Field.Label>Library Name</Field.Label>
          <Input.Root>
            <Input.Field />
          </Input.Root>
        </Field.Root>
        <button type="button">After</button>
      </>,
    );

    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "After" }))
      .toHaveFocus();
  });
});
