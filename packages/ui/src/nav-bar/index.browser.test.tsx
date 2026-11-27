import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { NavBar } from ".";

async function setup() {
  const screen = await render(
    <>
      <button type="button">Before</button>
      <NavBar.Root aria-label="Main">
        <NavBar.Brand href="#home">Pond</NavBar.Brand>
        <NavBar.List>
          <NavBar.Link href="#features" current>
            Features
          </NavBar.Link>
          <NavBar.Link href="#developers">Developers</NavBar.Link>
          <NavBar.Link href="#changelog">Changelog</NavBar.Link>
        </NavBar.List>
        <NavBar.Actions>
          <button type="button">Download</button>
        </NavBar.Actions>
      </NavBar.Root>
    </>,
  );
  const link = (name: string) => screen.getByRole("link", { name });
  await userEvent.click(screen.getByRole("button", { name: "Before" }));
  return { screen, link };
}

describe("NavBar", () => {
  it("is a named navigation landmark that marks the current page", async () => {
    const { screen, link } = await setup();

    await expect
      .element(screen.getByRole("navigation", { name: "Main" }))
      .toBeVisible();
    await expect
      .element(link("Features"))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(link("Developers"))
      .not.toHaveAttribute("aria-current");
  });

  it("tabs through the brand, every link and the actions in order", async () => {
    const { screen, link } = await setup();

    await userEvent.tab();
    await expect.element(link("Pond")).toHaveFocus();
    await userEvent.tab();
    await expect.element(link("Features")).toHaveFocus();
    await userEvent.tab();
    await expect.element(link("Developers")).toHaveFocus();
    await userEvent.tab();
    await expect.element(link("Changelog")).toHaveFocus();
    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "Download" }))
      .toHaveFocus();
  });

  it("moves between links with the arrows, Home and End, without wrapping", async () => {
    const { link } = await setup();

    await userEvent.tab();
    await userEvent.tab();
    await expect.element(link("Features")).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(link("Developers")).toHaveFocus();
    await userEvent.keyboard("{End}");
    await expect.element(link("Changelog")).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(link("Changelog")).toHaveFocus();
    await userEvent.keyboard("{Home}");
    await expect.element(link("Features")).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(link("Features")).toHaveFocus();
  });
});
