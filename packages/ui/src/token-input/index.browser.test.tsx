import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectAccessible } from "../../test/axe";
import { TokenInput, type TokenInputValue } from ".";

const SAVES = [
  { value: "save-1", label: "Type specimens" },
  { value: "save-2", label: "Poster series" },
];

function Field({
  onSubmit,
  defaultValue,
  disabled,
}: {
  onSubmit?: (value: TokenInputValue) => void;
  defaultValue?: TokenInputValue;
  disabled?: boolean;
}) {
  return (
    <TokenInput.Root
      defaultValue={defaultValue}
      disabled={disabled}
      onSubmit={onSubmit}
      renderToken={(token) => (
        <TokenInput.Token>{token.label}</TokenInput.Token>
      )}
    >
      <TokenInput.Editor aria-label="Message" placeholder="Type @" />
      <TokenInput.Menu triggers={[{ char: "@", type: "save", items: SAVES }]}>
        <TokenInput.Popup>
          <TokenInput.Status />
          <TokenInput.Empty>No Saves found.</TokenInput.Empty>
          <TokenInput.List>
            {SAVES.map((save) => (
              <TokenInput.Item
                key={save.value}
                value={save.value}
                label={save.label}
              >
                <TokenInput.ItemLabel>{save.label}</TokenInput.ItemLabel>
              </TokenInput.Item>
            ))}
          </TokenInput.List>
        </TokenInput.Popup>
      </TokenInput.Menu>
    </TokenInput.Root>
  );
}

describe("TokenInput keyboard", () => {
  it("reaches the editor with Tab, suggests on @ and inserts the chosen Save", async () => {
    const onSubmit = vi.fn();
    await render(<Field onSubmit={onSubmit} />);
    const editor = page.getByRole("textbox", { name: "Message" });

    await userEvent.tab();
    await expect.element(editor).toHaveFocus();

    await userEvent.keyboard("Compare @pos");
    await expect
      .element(page.getByRole("option", { name: "Poster series" }))
      .toBeVisible();
    await expectAccessible();

    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
    await expect.element(editor).toHaveFocus();
    await expect.element(editor.getByText("Poster series")).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toEqual([
      "Compare ",
      expect.objectContaining({ type: "save", value: "save-2" }),
      " ",
    ]);
  });

  it("closes the suggestions with Escape and keeps focus in the editor", async () => {
    await render(<Field />);
    const editor = page.getByRole("textbox", { name: "Message" });

    await userEvent.click(editor);
    await userEvent.keyboard("@");
    await expect.element(page.getByRole("listbox")).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
    await expect.element(editor).toHaveFocus();
  });

  it("removes a whole token with one Backspace", async () => {
    await render(
      <Field
        defaultValue={[
          "See ",
          { type: "save", value: "save-1", label: "Type specimens" },
        ]}
      />,
    );
    const editor = page.getByRole("textbox", { name: "Message" });

    await userEvent.click(editor);
    await userEvent.keyboard("{End}{Backspace}");
    await expect
      .element(editor.getByText("Type specimens"))
      .not.toBeInTheDocument();
  });

  it("can't be focused or edited while disabled", async () => {
    await render(<Field disabled defaultValue={["Draft"]} />);

    await userEvent.tab();
    await expect
      .element(page.getByRole("textbox", { name: "Message" }))
      .not.toHaveFocus();
  });
});
