import { useState } from "react";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Rating } from ".";

function Harness({ initial }: { initial: number | null }) {
  const [value, setValue] = useState(initial);
  return <Rating value={value} onValueChange={setValue} />;
}

describe("Rating keyboard", () => {
  it("moves and picks with arrows, Home and End", async () => {
    const screen = await render(<Harness initial={3} />);
    const star = (name: string) => screen.getByRole("radio", { name });

    await userEvent.tab();
    await expect.element(star("3 Stars")).toHaveFocus();
    await expect
      .element(star("3 Stars"))
      .toHaveAttribute("aria-checked", "true");

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(star("4 Stars")).toHaveFocus();
    await expect
      .element(star("4 Stars"))
      .toHaveAttribute("aria-checked", "true");

    await userEvent.keyboard("{ArrowLeft}");
    await expect
      .element(star("3 Stars"))
      .toHaveAttribute("aria-checked", "true");

    await userEvent.keyboard("{Home}");
    await expect.element(star("1 Star")).toHaveFocus();
    await expect
      .element(star("1 Star"))
      .toHaveAttribute("aria-checked", "true");

    await userEvent.keyboard("{End}");
    await expect.element(star("5 Stars")).toHaveFocus();
    await expect
      .element(star("5 Stars"))
      .toHaveAttribute("aria-checked", "true");
  });

  it("picks with digit keys and clears with Backspace", async () => {
    const screen = await render(<Harness initial={0} />);
    const star = (name: string) => screen.getByRole("radio", { name });

    await userEvent.tab();
    await expect.element(star("1 Star")).toHaveFocus();

    await userEvent.keyboard("2");
    await expect.element(star("2 Stars")).toHaveFocus();
    await expect
      .element(star("2 Stars"))
      .toHaveAttribute("aria-checked", "true");

    await userEvent.keyboard("{Backspace}");
    await expect.element(star("1 Star")).toHaveFocus();
    for (const name of ["1 Star", "2 Stars", "3 Stars", "4 Stars", "5 Stars"]) {
      await expect.element(star(name)).toHaveAttribute("aria-checked", "false");
    }
  });

  it("picks a clicked star without taking focus from the control that had it", async () => {
    const screen = await render(
      <>
        <button type="button">Before</button>
        <Harness initial={0} />
      </>,
    );
    const before = screen.getByRole("button", { name: "Before" });

    await userEvent.click(before);
    await userEvent.click(screen.getByRole("radio", { name: "3 Stars" }));
    await expect
      .element(screen.getByRole("radio", { name: "3 Stars" }))
      .toHaveAttribute("aria-checked", "true");
    await expect.element(before).toHaveFocus();

    await userEvent.click(screen.getByRole("radio", { name: "3 Stars" }));
    await expect
      .element(screen.getByRole("radio", { name: "3 Stars" }))
      .toHaveAttribute("aria-checked", "false");
    await expect.element(before).toHaveFocus();
  });

  it("names a mixed value until a star is picked", async () => {
    const screen = await render(<Harness initial={null} />);

    await expect
      .element(
        screen.getByRole("radiogroup", { name: "Rating, multiple values" }),
      )
      .toBeVisible();

    await userEvent.tab();
    await userEvent.keyboard("4");
    await expect
      .element(screen.getByRole("radiogroup", { name: "Rating", exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("radio", { name: "4 Stars" }))
      .toHaveAttribute("aria-checked", "true");
  });
});
