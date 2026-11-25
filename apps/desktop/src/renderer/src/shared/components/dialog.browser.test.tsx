/// <reference types="@vitest/browser-playwright" />
import { Dialog } from "@pond/ui";
import { isHTMLElement } from "@pond/ui/dom";
import { clsx as cn } from "clsx";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import type { MockInstance } from "vitest";
import { cdp } from "vitest/browser";

let root: Root;
let host: HTMLDivElement;
let observe: MockInstance<ResizeObserver["observe"]>;
let disconnect: MockInstance<ResizeObserver["disconnect"]>;

beforeAll(async () => {
  await cdp().send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
});

afterAll(async () => {
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
});

beforeEach(() => {
  observe = vi.spyOn(ResizeObserver.prototype, "observe");
  disconnect = vi.spyOn(ResizeObserver.prototype, "disconnect");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

/** Indexes of the first `observe` call of each live observer watching an element with this text. */
function liveObservers(text: string): Array<number> {
  const disconnected = new Set(disconnect.mock.contexts);
  const seen = new Set(disconnected);
  const live: Array<number> = [];
  observe.mock.calls.forEach(([target], index) => {
    const observer = observe.mock.contexts[index];
    if (target.textContent === text && !seen.has(observer)) {
      seen.add(observer);
      live.push(index);
    }
  });
  return live;
}

/** Every element observed by the observer that made the `observe` call at `index`. */
function observedWith(index: number): Array<Element> {
  const observer = observe.mock.contexts[index];
  return observe.mock.calls.flatMap(([target], call) =>
    observe.mock.contexts[call] === observer ? [target] : [],
  );
}

function sizeTo(element: HTMLElement, height: number) {
  element.style.boxSizing = "border-box";
  element.style.flex = "none";
  element.style.height = `${height}px`;
}

function button(label: string) {
  const found = Array.from(document.querySelectorAll("button")).find(
    (element) =>
      element.textContent === label ||
      element.getAttribute("aria-label") === label,
  );
  if (!found) {
    throw new Error(`Missing button: ${label}`);
  }
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
  const { promise, resolve: finish } = Promise.withResolvers<void>();
  let confirms = 0;
  const onConfirm = () => {
    confirms += 1;
    return promise;
  };
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
  expect(confirms).toBe(1);
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
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      }),
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
  if (!isHTMLElement(checkbox)) {
    throw new Error("Missing confirmation checkbox");
  }
  expect(checkbox.getAttribute("aria-checked")).toBe("false");
  await act(async () => checkbox.click());
  expect(checkbox.getAttribute("aria-checked")).toBe("true");
  await act(async () => button("Remove").click());
  expect(onConfirm).toHaveBeenCalledWith({ checked: true });
});

it("preserves prompt values after failure and supports retry", async () => {
  const attempts: Array<string> = [];
  const onConfirm = async (value: string) => {
    attempts.push(value);
    if (attempts.length === 1) {
      throw new Error("Couldn't rename. Try again.");
    }
  };
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
  expect(attempts).toEqual(["Ideas", "Ideas"]);
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
  let removals = 0;
  const onConfirm = async () => {
    removals += 1;
    if (removals === 1) {
      throw new Error("Couldn't remove. Try again.");
    }
  };
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
  const { promise, resolve: finish } = Promise.withResolvers<void>();
  let confirms = 0;
  const onConfirm = () => {
    confirms += 1;
    return promise;
  };
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
  expect(confirms).toBe(1);
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
  await vi.waitFor(() =>
    expect(document.querySelectorAll("[data-dialog-page]")).toHaveLength(1),
  );
  const active = liveObservers("Page 1");
  expect(active).toHaveLength(1);
  const popup = document.querySelector<HTMLElement>('[role="dialog"]');
  const page = popup?.querySelector<HTMLElement>("[data-dialog-page]");
  const header = popup?.querySelector("header");
  if (!popup || !page || !header) {
    throw new Error("Missing dialog parts");
  }
  expect(observedWith(active[0] ?? -1)).toContain(page);
  sizeTo(header, 64);
  sizeTo(page, 300);
  await vi.waitFor(() =>
    expect(popup.style.getPropertyValue("--height")).toBe("364px"),
  );
  expect(liveObservers("Page 0")).toHaveLength(0);
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
  if (!popup || !page || !header || !footer) {
    throw new Error("Missing dialog parts");
  }
  const [observer] = liveObservers("Page 0");
  expect(observedWith(observer ?? -1)).toContain(footer);
  sizeTo(page, 192);
  sizeTo(header, 80);
  sizeTo(footer, 72);
  await vi.waitFor(() =>
    expect(popup.style.getPropertyValue("--height")).toBe("344px"),
  );
  sizeTo(footer, 100);
  await vi.waitFor(() =>
    expect(popup.style.getPropertyValue("--height")).toBe("372px"),
  );
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
  const { promise: pending, resolve: finish } = Promise.withResolvers<void>();
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
