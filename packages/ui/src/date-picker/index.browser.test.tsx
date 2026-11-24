import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { DatePicker } from ".";
import { expectAccessible } from "../../test/axe";

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <DatePicker
      aria-label="Imported After"
      locale="en-US"
      value={value}
      onValueChange={setValue}
    />
  );
}

const trigger = () => page.getByRole("button", { name: /^Imported After/ });
const day = (name: string) => page.getByRole("gridcell", { name });

describe("DatePicker keyboard", () => {
  it("opens on the chosen day and moves through the grid", async () => {
    await render(<Harness initial="2026-01-15" />);

    await userEvent.tab();
    await expect.element(trigger()).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("grid", { name: "January 2026" }))
      .toBeVisible();
    const selected = day("Thursday, January 15, 2026");
    await expect.element(selected).toHaveFocus();
    await expect.element(selected).toHaveAttribute("aria-selected", "true");
    await expectAccessible();

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(day("Friday, January 16, 2026")).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");
    await expect.element(day("Friday, January 23, 2026")).toHaveFocus();

    await userEvent.keyboard("{Home}");
    await expect.element(day("Sunday, January 18, 2026")).toHaveFocus();

    await userEvent.keyboard("{End}");
    await expect.element(day("Saturday, January 24, 2026")).toHaveFocus();

    await userEvent.keyboard("{PageDown}");
    await expect
      .element(page.getByRole("grid", { name: "February 2026" }))
      .toBeVisible();
    await expect.element(day("Tuesday, February 24, 2026")).toHaveFocus();

    await userEvent.keyboard("{PageUp}");
    await expect.element(day("Saturday, January 24, 2026")).toHaveFocus();
  });

  it("picks the focused day with Enter and returns focus to the trigger", async () => {
    await render(<Harness initial="2026-01-15" />);

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await expect.element(day("Thursday, January 15, 2026")).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{Enter}");

    await expect.element(page.getByRole("grid")).not.toBeInTheDocument();
    await expect.element(trigger()).toHaveFocus();
    await expect
      .element(trigger())
      .toHaveAccessibleName("Imported After: Jan 16, 2026");
  });

  it("closes with Escape and returns focus to the trigger", async () => {
    await render(<Harness initial="" />);

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("grid")).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("grid")).not.toBeInTheDocument();
    await expect.element(trigger()).toHaveFocus();
  });

  it("keeps focus off days outside the allowed range", async () => {
    await render(
      <DatePicker
        aria-label="Imported After"
        locale="en-US"
        value="2026-10-16"
        max="2026-10-17"
        onValueChange={() => {}}
      />,
    );

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await expect.element(day("Friday, October 16, 2026")).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(day("Saturday, October 17, 2026")).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(day("Saturday, October 17, 2026")).toHaveFocus();
    await expect
      .element(day("Sunday, October 18, 2026"))
      .toHaveAttribute("aria-disabled", "true");
  });

  it("skips a disabled picker in the tab order", async () => {
    await render(
      <>
        <DatePicker
          aria-label="Imported After"
          locale="en-US"
          value=""
          onValueChange={() => {}}
          disabled
        />
        <button type="button">After</button>
      </>,
    );

    await userEvent.tab();
    await expect
      .element(page.getByRole("button", { name: "After" }))
      .toHaveFocus();
  });
});
