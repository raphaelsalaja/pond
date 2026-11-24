import { Dialog } from "@pond/ui";
import { clsx as cn } from "clsx";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let root: Root;
let host: HTMLDivElement;
const observers: {
  targets: Element[];
  disconnected: boolean;
  callback: () => void;
}[] = [];

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      record: (typeof observers)[number];
      constructor(callback: () => void) {
        this.record = { callback, disconnected: false, targets: [] };
        observers.push(this.record);
      }
      observe(target: Element) {
        this.record.targets.push(target);
      }
      unobserve(target: Element) {
        this.record.targets = this.record.targets.filter(
          (item) => item !== target,
        );
      }
      disconnect() {
        this.record.disconnected = true;
      }
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  observers.length = 0;
  vi.unstubAllGlobals();
});

function button(label: string) {
  const found = Array.from(document.querySelectorAll("button")).find(
    (element) =>
      element.textContent === label ||
      element.getAttribute("aria-label") === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

it("preserves shared layout classes when a caller adds its own class", async () => {
  await act(async () =>
    root.render(
      <>
        <div data-set="shared">
          <Dialog.Header />
          <Dialog.Content />
          <Dialog.Footer />
        </div>
        <div data-set="custom">
          <Dialog.Header className="custom-header">
            <Dialog.Back />
            <h2>Title</h2>
            <Dialog.Action position="end">Close</Dialog.Action>
          </Dialog.Header>
          <Dialog.Content className="custom-content">Content</Dialog.Content>
          <Dialog.Footer className="custom-footer">Footer</Dialog.Footer>
        </div>
      </>,
    ),
  );
  const shared = [...host.querySelectorAll('[data-set="shared"] > *')];
  const custom = [...host.querySelectorAll('[data-set="custom"] > *')];
  expect(shared.every((element) => element.className)).toBe(true);
  expect(custom.map((element) => element.className)).toEqual(
    shared.map((element, index) =>
      cn(
        element.className,
        ["custom-header", "custom-content", "custom-footer"][index],
      ),
    ),
  );
  expect(
    [...host.querySelectorAll("button")].map(
      (element) => element.getAttribute("aria-label") ?? element.textContent,
    ),
  ).toEqual(["Back", "Close"]);
});

it("renders prompt inputs inside their styled root with an accessible name", async () => {
  await act(async () => root.render(<Dialog.Host />));
  await act(async () =>
    Dialog.prompt({
      title: "Rename Folder",
      confirmLabel: "Rename",
      initialValue: "Ideas",
      onConfirm: vi.fn(),
    }),
  );
  const input = document.querySelector("input");
  expect(input?.parentElement?.dataset.slot).toBe("root");
  expect(input?.getAttribute("aria-labelledby")).toBeTruthy();
  expect(input?.value).toBe("Ideas");
  expect(button("Cancel").type).toBe("button");
});

it("uses compact confirmation actions in the footer", async () => {
  await act(async () =>
    root.render(
      <Dialog.Footer>
        <Dialog.Confirm />
      </Dialog.Footer>,
    ),
  );
  expect(button("Confirm").dataset.size).toBe("xs");
});

it("keeps a prompt open and blocks duplicate submissions while saving", async () => {
  let finish = () => {};
  const onConfirm = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => root.render(<Dialog.Host />));
  await act(async () =>
    Dialog.prompt({
      title: "Rename Folder",
      confirmLabel: "Rename",
      initialValue: "Moodboards",
      onConfirm,
    }),
  );
  const submit = button("Rename");
  await act(async () => {
    submit.click();
    submit.click();
  });
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(
    document.querySelector('[role="dialog"]')?.hasAttribute("data-open"),
  ).toBe(true);
  expect(button("Cancel").disabled).toBe(true);
  await act(async () => finish());
  expect(document.querySelector('[role="dialog"][data-open]')).toBeNull();
});

it("focuses the safe close action before a destructive action", async () => {
  await act(async () => root.render(<Dialog.Host />));
  await act(async () =>
    Dialog.confirm({
      title: "Remove Folder",
      confirmLabel: "Remove",
      onConfirm: vi.fn(),
    }),
  );
  await act(
    async () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  expect(document.activeElement).toBe(button("Cancel"));
});

it("passes the confirmation checkbox value to the action", async () => {
  const onConfirm = vi.fn();
  await act(async () => root.render(<Dialog.Host />));
  await act(async () =>
    Dialog.confirm({
      title: "Remove Folder",
      confirmLabel: "Remove",
      checkbox: { label: "Move Saves to Trash" },
      onConfirm,
    }),
  );
  const checkbox = document.querySelector('[role="checkbox"]');
  if (!(checkbox instanceof HTMLElement))
    throw new Error("Missing confirmation checkbox");
  expect(checkbox.getAttribute("aria-checked")).toBe("false");
  await act(async () => checkbox.click());
  expect(checkbox.getAttribute("aria-checked")).toBe("true");
  await act(async () => button("Remove").click());
  expect(onConfirm).toHaveBeenCalledWith({ checked: true });
});

it("preserves prompt values after failure and supports retry", async () => {
  const onConfirm = vi
    .fn()
    .mockRejectedValueOnce(new Error("Couldn't rename. Try again."))
    .mockResolvedValueOnce(undefined);
  await act(async () => root.render(<Dialog.Host />));
  await act(async () =>
    Dialog.prompt({
      title: "Rename Folder",
      confirmLabel: "Rename",
      initialValue: "Ideas",
      onConfirm,
    }),
  );
  await act(async () => button("Rename").click());
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    "Couldn't rename. Try again.",
  );
  expect(document.querySelector("input")?.value).toBe("Ideas");
  expect(document.querySelector('[role="dialog"][data-open]')).not.toBeNull();
  await act(async () => button("Rename").click());
  expect(onConfirm).toHaveBeenNthCalledWith(2, "Ideas");
  expect(document.querySelector('[role="dialog"][data-open]')).toBeNull();
});

it("resets a prompt when it is reopened with another payload", async () => {
  await act(async () => root.render(<Dialog.Host />));
  await act(async () =>
    Dialog.prompt({
      title: "Rename Folder",
      confirmLabel: "Rename",
      initialValue: "First",
      onConfirm: vi.fn(),
    }),
  );
  await act(async () => button("Cancel").click());
  await act(async () =>
    Dialog.prompt({
      title: "Rename Folder",
      confirmLabel: "Rename",
      initialValue: "Second",
      onConfirm: vi.fn(),
    }),
  );
  expect(document.querySelector("input")?.value).toBe("Second");
});

it("handles confirmation failures without dismissing the dialog", async () => {
  const onConfirm = vi
    .fn()
    .mockRejectedValueOnce(new Error("Couldn't remove. Try again."))
    .mockResolvedValueOnce(undefined);
  await act(async () => root.render(<Dialog.Host />));
  await act(async () =>
    Dialog.confirm({
      title: "Remove Folder",
      confirmLabel: "Remove",
      onConfirm,
    }),
  );
  await act(async () => button("Remove").click());
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    "Couldn't remove. Try again.",
  );
  expect(
    document.querySelector('[role="alertdialog"][data-open]'),
  ).not.toBeNull();
  await act(async () => button("Remove").click());
  expect(document.querySelector('[role="alertdialog"][data-open]')).toBeNull();
});

it("blocks duplicate confirmations and Escape while an action is pending", async () => {
  let finish = () => {};
  const onConfirm = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => root.render(<Dialog.Host />));
  await act(async () =>
    Dialog.confirm({
      title: "Remove Folder",
      confirmLabel: "Remove",
      onConfirm,
    }),
  );
  const submit = button("Remove");
  await act(async () => {
    submit.click();
    submit.click();
  });
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(
    document.querySelector('[role="alertdialog"][data-open]'),
  ).not.toBeNull();
  expect(button("Cancel").disabled).toBe(true);
  await act(async () => finish());
  expect(document.querySelector('[role="alertdialog"][data-open]')).toBeNull();
});

function Pages({ page, footer = false }: { page: number; footer?: boolean }) {
  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Popup pageId={String(page)} depth={page}>
          <Dialog.Header>
            <Dialog.Title>Step {page}</Dialog.Title>
            <Dialog.Close />
          </Dialog.Header>
          <Dialog.Viewport>
            <button type="button">Page {page}</button>
          </Dialog.Viewport>
          {footer ? <footer>Privacy note</footer> : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

it("keeps measuring the active page after the outgoing page unmounts", async () => {
  await act(async () => root.render(<Pages page={0} />));
  await act(async () => root.render(<Pages page={1} />));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
  const active = observers.filter(
    (observer) =>
      observer.targets.some((target) => target.textContent === "Page 1") &&
      !observer.disconnected,
  );
  expect(active).toHaveLength(1);
  const page = active[0]?.targets.find(
    (target) => target.textContent === "Page 1",
  );
  if (!page) throw new Error("Missing active page observer");
  const header = document.querySelector('[role="dialog"] header');
  if (!header) throw new Error("Missing dialog header");
  Object.defineProperty(header, "offsetHeight", {
    configurable: true,
    value: 64,
  });
  Object.defineProperty(page, "offsetHeight", {
    configurable: true,
    value: 300,
  });
  await act(async () => active[0]?.callback());
  expect(
    document
      .querySelector<HTMLElement>('[role="dialog"]')
      ?.style.getPropertyValue("--height"),
  ).toBe("364px");
  expect(
    observers.filter(
      (observer) =>
        observer.targets.some((target) => target.textContent === "Page 0") &&
        !observer.disconnected,
    ),
  ).toHaveLength(0);
});

it("uses native keyboard semantics for the page close button", async () => {
  await act(async () => root.render(<Pages page={0} />));
  expect(button("Close").getAttribute("role")).not.toBe("button");
  expect(button("Close").type).toBe("button");
});

it("includes the header and persistent footer when sizing a page", async () => {
  await act(async () => root.render(<Pages page={0} footer />));
  const popup = document.querySelector<HTMLElement>('[role="dialog"]');
  const page = popup?.querySelector<HTMLElement>("[data-dialog-page]");
  const header = popup?.querySelector("header");
  const footer = popup?.querySelector("footer");
  if (!popup || !page || !header || !footer)
    throw new Error("Missing dialog parts");
  Object.defineProperty(page, "offsetHeight", {
    configurable: true,
    value: 192,
  });
  Object.defineProperty(header, "offsetHeight", {
    configurable: true,
    value: 80,
  });
  Object.defineProperty(footer, "offsetHeight", {
    configurable: true,
    value: 72,
  });
  const observer = observers.find(
    (entry) => entry.targets.includes(page) && !entry.disconnected,
  );
  expect(observer?.targets).toContain(footer);
  await act(async () => observer?.callback());
  expect(popup.style.getPropertyValue("--height")).toBe("344px");
  Object.defineProperty(footer, "offsetHeight", {
    configurable: true,
    value: 100,
  });
  await act(async () => observer?.callback());
  expect(popup.style.getPropertyValue("--height")).toBe("372px");
});

it("renders a static header close without submitting its form", async () => {
  const submit = vi.fn();
  await act(async () =>
    root.render(
      <Dialog.Root defaultOpen>
        <Dialog.Portal>
          <Dialog.Popup>
            <form onSubmit={submit}>
              <Dialog.Header>
                <Dialog.Title>Static form</Dialog.Title>
                <Dialog.Close />
              </Dialog.Header>
              <Dialog.Content>Body</Dialog.Content>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>,
    ),
  );
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(button("Close").type).toBe("button");
  await act(async () => button("Close").click());
  expect(submit).not.toHaveBeenCalled();
});

it("disables prompt header dismissal while saving", async () => {
  let finish = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await act(async () => root.render(<Dialog.Host />));
  await act(async () =>
    Dialog.prompt({
      title: "Save",
      confirmLabel: "Submit",
      initialValue: "Draft",
      onConfirm: () => pending,
    }),
  );
  await act(async () => button("Submit").click());
  expect(button("Cancel").disabled).toBe(true);
  await act(async () => button("Cancel").click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => finish());
});

it("supports command defaults through the shared host", async () => {
  const onConfirm = vi.fn();
  await act(async () => root.render(<Dialog.Host />));
  await act(async () => Dialog.confirm({ title: "Confirm action", onConfirm }));
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  await act(async () => button("Confirm").click());
  expect(onConfirm).toHaveBeenCalledOnce();
  await act(async () =>
    Dialog.prompt({ title: "Enter value", initialValue: "Value", onConfirm }),
  );
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => button("Confirm").click());
  expect(onConfirm).toHaveBeenLastCalledWith("Value");
});

it("explains an empty prompt beside the field instead of confirming", async () => {
  const onConfirm = vi.fn();
  await act(async () => root.render(<Dialog.Host />));
  await act(async () =>
    Dialog.prompt({
      title: "Enter value",
      emptyError: "Enter a page link to import.",
      onConfirm,
    }),
  );
  expect(button("Confirm").disabled).toBe(false);
  await act(async () => button("Confirm").click());
  expect(onConfirm).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("Enter a page link to import.");
  const field = document.activeElement;
  expect(field?.getAttribute("aria-invalid")).toBe("true");
});
