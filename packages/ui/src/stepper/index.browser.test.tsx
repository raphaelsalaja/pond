import { IconMinus, IconPlus } from "@pond/icons";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Stepper } from ".";

function Harness({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial);
  return (
    <Stepper
      aria-label="Columns"
      value={value}
      min={1}
      max={6}
      onValueChange={setValue}
      decrementIcon={<IconMinus />}
      incrementIcon={<IconPlus />}
    />
  );
}

describe("Stepper keyboard", () => {
  it("names the group and steps with its buttons and arrow keys", async () => {
    const screen = await render(<Harness initial={4} />);
    const field = screen.getByRole("spinbutton", { name: "Columns" });

    await expect
      .element(screen.getByRole("group", { name: "Columns" }))
      .toBeVisible();

    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "Decrease" }))
      .toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect.element(field).toHaveValue(3);

    await userEvent.tab();
    await expect.element(field).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    await expect.element(field).toHaveValue(4);
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(field).toHaveValue(2);

    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "Increase" }))
      .toHaveFocus();
    await userEvent.keyboard(" ");
    await expect.element(field).toHaveValue(3);
  });

  it("stops at the bounds and skips the disabled button", async () => {
    const screen = await render(<Harness initial={1} />);
    const field = screen.getByRole("spinbutton", { name: "Columns" });

    await userEvent.tab();
    await expect.element(field).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");
    await expect.element(field).toHaveValue(1);
  });
});
