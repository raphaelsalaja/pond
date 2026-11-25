import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { ColorField } from ".";

function Harness({ initial = "#3366cc" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ColorField.Root
        aria-label="Background"
        value={value}
        onChange={setValue}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

function current(): string {
  return page.getByTestId("value").element().textContent ?? "";
}

describe("ColorField keyboard", () => {
  it("tabs from the swatch to the hex field", async () => {
    await render(<Harness />);
    const swatch = page.getByRole("button", { name: "Background picker" });
    const hex = page.getByRole("textbox", { name: "Background hex" });

    await userEvent.tab();
    await expect.element(swatch).toHaveFocus();

    await userEvent.tab();
    await expect.element(hex).toHaveFocus();
    await expect.element(hex).toHaveValue("#3366cc");
  });

  it("opens the picker, steps the area and hue, and closes back to the swatch", async () => {
    await render(<Harness />);
    const swatch = page.getByRole("button", { name: "Background picker" });
    const hex = page.getByRole("textbox", { name: "Background hex" });

    await userEvent.tab();
    await expect.element(swatch).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    const area = page.getByRole("slider", {
      name: "Background saturation and brightness",
    });
    const hue = page.getByRole("slider", { name: "Background hue" });
    await expect.element(area).toHaveFocus();

    const start = current();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(current).not.toBe(start);
    const across = current();

    await userEvent.keyboard("{ArrowUp}");
    await expect.poll(current).not.toBe(across);
    const up = current();
    await expect.element(hex).toHaveValue(up);

    await userEvent.tab();
    await expect.element(hue).toHaveFocus();
    await expect.element(hue).toHaveAttribute("aria-orientation", "vertical");
    const hueBefore = hue.element().getAttribute("aria-valuenow");

    await userEvent.keyboard("{ArrowUp}");
    await expect.poll(current).not.toBe(up);
    expect(hue.element().getAttribute("aria-valuenow")).not.toBe(hueBefore);
    await expect.element(hex).toHaveValue(current());

    await userEvent.keyboard("{Escape}");
    await expect.element(hue).not.toBeInTheDocument();
    await expect.element(swatch).toHaveFocus();
  });
});
