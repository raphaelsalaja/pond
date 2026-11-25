import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { Slider } from ".";

describe("Slider keyboard", () => {
  it("steps with arrows, PageUp, PageDown, Home and End", async () => {
    const screen = await render(
      <Slider.Root defaultValue={50}>
        <Slider.Control>
          <Slider.Track>
            <Slider.Indicator />
            <Slider.Thumb aria-label="Thumbnail Size" />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>,
    );
    const thumb = screen.getByRole("slider", { name: "Thumbnail Size" });

    await userEvent.tab();
    await expect.element(thumb).toHaveFocus();
    await expect.element(thumb).toHaveAttribute("aria-valuenow", "50");

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(thumb).toHaveAttribute("aria-valuenow", "51");

    await userEvent.keyboard("{ArrowDown}");
    await expect.element(thumb).toHaveAttribute("aria-valuenow", "50");

    await userEvent.keyboard("{PageUp}");
    await expect.element(thumb).toHaveAttribute("aria-valuenow", "60");

    await userEvent.keyboard("{PageDown}");
    await expect.element(thumb).toHaveAttribute("aria-valuenow", "50");

    await userEvent.keyboard("{End}");
    await expect.element(thumb).toHaveAttribute("aria-valuenow", "100");

    await userEvent.keyboard("{Home}");
    await expect.element(thumb).toHaveAttribute("aria-valuenow", "0");
  });

  it("takes its name from Slider.Label", async () => {
    const screen = await render(
      <Slider.Root defaultValue={40}>
        <Slider.Label>Thumbnail Size</Slider.Label>
        <Slider.Control>
          <Slider.Track>
            <Slider.Thumb />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>,
    );

    await expect
      .element(screen.getByRole("slider", { name: "Thumbnail Size" }))
      .toBeInTheDocument();
  });

  it("skips a disabled slider in the tab order", async () => {
    const screen = await render(
      <>
        <Slider.Root defaultValue={40} disabled>
          <Slider.Control>
            <Slider.Track>
              <Slider.Thumb aria-label="Thumbnail Size" />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
        <button type="button">After</button>
      </>,
    );

    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "After" }))
      .toHaveFocus();
  });
});
