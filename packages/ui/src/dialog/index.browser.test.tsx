import { useState } from "react";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectAccessible } from "../../test/axe";
import { Button } from "../button";
import { Dialog } from ".";

function RenameFolder() {
  return (
    <Dialog.Root>
      <Dialog.Trigger render={<Button variant="secondary" />}>
        Rename Folder
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Header>
            <Dialog.Title>Rename Folder</Dialog.Title>
            <Dialog.Close />
          </Dialog.Header>
          <Dialog.Content>
            <Dialog.Description>
              Saves keep their tags when the folder moves.
            </Dialog.Description>
          </Dialog.Content>
          <Dialog.Footer>
            <Dialog.Cancel />
            <Dialog.Confirm>Rename</Dialog.Confirm>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const STEPS = [
  { title: "Choose a Source", description: "Pick where your saves come from." },
  { title: "Pick a Folder", description: "New saves land in this folder." },
];

function ConnectSource() {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  return (
    <Dialog.Root defaultOpen>
      <Dialog.Portal>
        <Dialog.Popup pageId={String(step)} depth={step}>
          <Dialog.Header>
            <Dialog.Title>{current?.title}</Dialog.Title>
            <Dialog.Close />
          </Dialog.Header>
          <Dialog.Viewport>
            <Dialog.Description>{current?.description}</Dialog.Description>
            {step === 0 ? (
              <Button onClick={() => setStep(1)}>Next</Button>
            ) : null}
          </Dialog.Viewport>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const THUMBNAIL = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#8a8f98"/></svg>',
)}`;

function ViewThumbnail() {
  return (
    <Dialog.Root>
      <Dialog.Trigger render={<Button variant="secondary" />}>
        View Thumbnail
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop data-testid="backdrop" />
        <Dialog.Popup variant="media" aria-label="Thumbnail">
          <img src={THUMBNAIL} alt="Gray placeholder" />
          <Dialog.Close />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const button = (name: string) =>
  page.getByRole("button", { name, exact: true });

describe("Dialog keyboard", () => {
  it("opens with Enter, traps focus, and closes with Escape", async () => {
    const screen = await render(<RenameFolder />);
    const trigger = screen.getByRole("button", { name: "Rename Folder" });

    await userEvent.tab();
    await expect.element(trigger).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    const dialog = page.getByRole("dialog", { name: "Rename Folder" });
    await expect.element(dialog).toBeVisible();
    await expect
      .element(dialog)
      .toHaveAccessibleDescription(
        "Saves keep their tags when the folder moves.",
      );
    await expect.element(button("Close")).toHaveFocus();
    await expectAccessible();

    await userEvent.tab();
    await expect.element(button("Cancel")).toHaveFocus();
    await userEvent.tab();
    await expect.element(button("Rename")).toHaveFocus();
    await userEvent.tab();
    await expect.element(button("Close")).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect.element(button("Rename")).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
  });

  it("returns focus to the trigger after Cancel", async () => {
    const screen = await render(<RenameFolder />);
    const trigger = screen.getByRole("button", { name: "Rename Folder" });

    await userEvent.click(trigger);
    await userEvent.click(button("Cancel"));

    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
  });

  it("focuses Cancel first in a confirm alert dialog", async () => {
    await render(<Dialog.Host />);
    Dialog.confirm({
      title: "Empty Trash",
      description: "Every save in Trash is deleted for good.",
      confirmLabel: "Empty Trash",
      onConfirm: () => {},
    });

    const dialog = page.getByRole("alertdialog", { name: "Empty Trash" });
    await expect.element(dialog).toBeVisible();
    await expect
      .element(dialog)
      .toHaveAccessibleDescription("Every save in Trash is deleted for good.");
    await expect.element(button("Cancel")).toHaveFocus();
    await expectAccessible();

    await userEvent.keyboard("{Escape}");
    await expect.element(dialog).not.toBeInTheDocument();
  });
});

describe("Dialog media", () => {
  it("stays open on its content and closes from the space around it", async () => {
    const screen = await render(<ViewThumbnail />);
    const trigger = screen.getByRole("button", { name: "View Thumbnail" });

    await userEvent.click(trigger);
    const dialog = page.getByRole("dialog", { name: "Thumbnail" });
    await expect.element(dialog).toBeVisible();
    await expect.element(button("Close")).toHaveFocus();
    await expectAccessible();

    await userEvent.click(page.getByRole("img", { name: "Gray placeholder" }));
    await expect.element(dialog).toBeVisible();

    await userEvent.click(page.getByTestId("backdrop"), {
      position: { x: 8, y: 300 },
    });
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
  });

  it("closes with Escape and returns focus to the trigger", async () => {
    const screen = await render(<ViewThumbnail />);
    const trigger = screen.getByRole("button", { name: "View Thumbnail" });

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("dialog", { name: "Thumbnail" }))
      .toBeVisible();

    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
  });
});

describe("Dialog pages", () => {
  it("describes the popup with the current page only", async () => {
    await render(<ConnectSource />);
    const dialog = page.getByRole("dialog");

    await expect
      .element(dialog)
      .toHaveAccessibleDescription("Pick where your saves come from.");
    await expectAccessible();

    await userEvent.click(button("Next"));
    await expect
      .element(dialog)
      .toHaveAccessibleDescription("New saves land in this folder.");
    await expect
      .element(page.getByText("Pick where your saves come from."))
      .not.toBeInTheDocument();
    await expect
      .element(dialog)
      .toHaveAccessibleDescription("New saves land in this folder.");
    await expectAccessible();
  });
});
