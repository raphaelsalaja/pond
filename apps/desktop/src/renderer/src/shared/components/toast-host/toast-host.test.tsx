import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ask,
  notify,
  toastManager,
  updateNotification,
} from "@/shared/lib/toast";
import { ToastHost } from ".";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  toastManager.close();
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("renders toasts at the app root", async () => {
  await act(async () => root.render(<ToastHost />));

  await act(async () => {
    notify({ id: "copied", title: "Copied to clipboard" });
  });

  const viewport = document.body.querySelector("[data-slot='toasts']");
  expect(viewport?.textContent).toContain("Copied to clipboard");
  expect(host.contains(viewport)).toBe(false);
});

it("keeps repeated notifications as unique toast instances", async () => {
  await act(async () => root.render(<ToastHost />));

  const ids: string[] = [];
  await act(async () => {
    for (let index = 0; index < 4; index += 1) {
      ids.push(
        notify({
          id: "copy-media",
          title: "Image copied to clipboard",
          timeout: 0,
        }),
      );
    }
  });

  const viewport = document.body.querySelector("[data-slot='toasts']");
  expect(new Set(ids).size).toBe(4);
  expect(viewport?.querySelectorAll("[role='dialog']")).toHaveLength(4);
  expect(viewport?.querySelectorAll("[data-limited]")).toHaveLength(0);
});

it("renders determinate toast progress", async () => {
  await act(async () => root.render(<ToastHost />));

  let notificationId = "";
  await act(async () => {
    notificationId = notify({
      id: "import",
      title: "Importing Eagle library",
      description: "0 of 10 items",
      progress: {
        label: "Eagle library import progress",
        value: 0,
        max: 10,
      },
      timeout: 0,
    });
  });

  await act(async () => {
    updateNotification({
      id: notificationId,
      title: "Importing Eagle library",
      description: "6 of 10 items",
      progress: {
        label: "Eagle library import progress",
        detail: "4 imported · 1 skipped · 1 failed",
        value: 6,
        max: 10,
      },
      timeout: 0,
    });
  });

  const progress = document.body.querySelector<HTMLProgressElement>(
    'progress[aria-label="Eagle library import progress"]',
  );
  expect(progress?.closest("[data-slot='toasts']")?.textContent).toContain(
    "6 of 10 items",
  );
  expect(progress?.closest("[data-slot='toasts']")?.textContent).toContain(
    "4 imported · 1 skipped · 1 failed",
  );
  expect(progress?.value).toBe(6);
  expect(progress?.max).toBe(10);
});

it("renders and invokes a toast action", async () => {
  const onClick = vi.fn();
  await act(async () => root.render(<ToastHost />));

  await act(async () => {
    notify({
      id: "folder-assignment",
      title: 'Added 3 Saves to "Research"',
      action: { label: "Undo", onClick },
      timeout: 0,
    });
  });

  const action = [...document.body.querySelectorAll("button")].find(
    (button) => button.textContent === "Undo",
  );
  expect(action).toBeInstanceOf(HTMLButtonElement);
  await act(async () => action?.click());
  expect(onClick).toHaveBeenCalledOnce();
});

function button(label: string) {
  return [...document.body.querySelectorAll("button")].find(
    (element) => element.textContent === label,
  );
}

it("renders an ask that stays until you answer it", async () => {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  await act(async () => root.render(<ToastHost />));

  await act(async () => {
    ask({
      title: "Follow Along on X",
      description: "Follow Raphael for new features and fixes.",
      note: "Posts stay on X.",
      cancel: "Not Now",
      confirm: "Follow on X",
      onConfirm,
      onClose,
    });
  });

  const viewport = document.body.querySelector("[data-slot='toasts']");
  expect(viewport?.textContent).toContain("Follow Along on X");
  expect(viewport?.textContent).toContain("Posts stay on X.");
  expect(button("Not Now")).toBeInstanceOf(HTMLButtonElement);
  expect(viewport?.querySelector("[aria-label='Dismiss']")).toBeNull();

  await act(async () => button("Follow on X")?.click());
  expect(onConfirm).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});

it("closes an ask from Not Now without confirming", async () => {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  await act(async () => root.render(<ToastHost />));

  await act(async () => {
    ask({
      title: "Star Pond on GitHub",
      description: "A star helps more people find Pond.",
      cancel: "Not Now",
      confirm: "Star on GitHub",
      onConfirm,
      onClose,
    });
  });

  await act(async () => button("Not Now")?.click());
  expect(onConfirm).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
});
