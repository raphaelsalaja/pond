import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectAccessible } from "../../test/axe";
import { Button } from "../button";
import { Toast } from ".";

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport>
        {toasts.map((toast) => (
          <Toast.Root key={toast.id} toast={toast}>
            <Toast.Content>
              <Toast.Header>
                <Toast.Title />
                <Toast.Description />
              </Toast.Header>
              <Toast.Close />
            </Toast.Content>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

function AddButton({ priority }: { priority?: "high" }) {
  const { add } = Toast.useToastManager();
  return (
    <Button
      onClick={() =>
        add({
          title: priority ? "Sync paused" : "Link saved",
          description: priority
            ? "Reconnect Are.na to keep fetching saves."
            : "Find it in Inspiration.",
          priority,
        })
      }
    >
      Save Link
    </Button>
  );
}

async function setup(priority?: "high") {
  const screen = await render(
    <Toast.Provider timeout={0}>
      <AddButton priority={priority} />
      <ToastList />
    </Toast.Provider>,
  );
  const trigger = screen.getByRole("button", { name: "Save Link" });
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");
  return { trigger };
}

describe("Toast announcements", () => {
  it("adds the toast inside a polite live region", async () => {
    await setup();
    const region = page.getByRole("region", { name: "Notifications" });

    await expect.element(region).toHaveAttribute("aria-live", "polite");
    await expect
      .poll(() => region.element().textContent)
      .toContain("Link saved");

    const toast = page.getByRole("dialog", { name: "Link saved" });
    await expect.element(toast).toBeVisible();
    await expect
      .element(toast)
      .toHaveAccessibleDescription("Find it in Inspiration.");
    await expectAccessible();
  });

  it("reads high-priority toasts through an alert", async () => {
    await setup("high");

    await expect
      .poll(() => page.getByRole("alert").element().textContent)
      .toContain("Sync paused");
  });
});

describe("Toast keyboard", () => {
  it("moves focus to the stack with F6 and dismisses with Escape", async () => {
    await setup();
    const toast = page.getByRole("dialog", { name: "Link saved" });
    await expect.element(toast).toBeVisible();

    await userEvent.keyboard("{F6}");
    await expect
      .element(page.getByRole("region", { name: "Notifications" }))
      .toHaveFocus();

    await userEvent.tab();
    await expect.element(toast).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect.element(toast).not.toBeInTheDocument();
  });

  it("dismisses from the Dismiss button", async () => {
    await setup();
    const toast = page.getByRole("dialog", { name: "Link saved" });
    await expect.element(toast).toBeVisible();

    await userEvent.hover(toast);
    await userEvent.click(page.getByRole("button", { name: "Dismiss" }));
    await expect.element(toast).not.toBeInTheDocument();
  });
});
