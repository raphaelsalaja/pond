import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

type Status = {
  state: string;
  bundleId: string | null;
  signature: string;
};

const SIGNED = {
  bundleId: "so.pond.desktop.Extension",
  signature: "developer-id",
};

/**
 * `IS_MAC` is read from `navigator.platform` when the platform module first loads, so the
 * platform has to be in place before the dialog is imported and the module graph reset
 * between cases.
 */
async function renderDialog(
  platform: string,
  status: Status | null,
  settingsResult:
    | { ok: true }
    | { ok: false; reason: string; error: string } = {
    ok: true,
  },
) {
  Object.defineProperty(globalThis.navigator, "platform", {
    value: platform,
    configurable: true,
  });
  vi.resetModules();
  const calls: Array<string> = [];
  vi.stubGlobal("pond", {
    async query(name: string) {
      calls.push(name);
      if (name === "extension.safariStatus") {
        if (!status) {
          throw new Error("status unavailable");
        }
        return status;
      }
      if (name === "extension.openSafariSettings") {
        return settingsResult;
      }
      if (name === "extension.openSafari") {
        return { ok: true };
      }
      throw new Error(`Unexpected query: ${name}`);
    },
    async openExternal() {
      return { ok: true };
    },
  });
  const { BrowserExtensionDialog } = await import("./index");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(<BrowserExtensionDialog open onOpenChange={() => {}} />),
  );
  return {
    calls,
    text: () => document.body.textContent ?? "",
    buttons: () =>
      [...document.body.querySelectorAll("button")].map(
        (button) => button.textContent?.trim() ?? "",
      ),
    async click(label: string) {
      const button = [...document.body.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === label,
      );
      if (!button) {
        throw new Error(`No button labelled ${label}`);
      }
      await act(async () => button.click());
    },
    async cleanup() {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

it("reports Safari as enabled and offers no action", async () => {
  const view = await renderDialog("MacIntel", { state: "enabled", ...SIGNED });
  try {
    expect(view.text()).toContain("Safari");
    expect(view.text()).toContain("Enabled");
    expect(view.buttons()).not.toContain("Open Safari Settings");
    expect(view.calls).toContain("extension.safariStatus");
  } finally {
    await view.cleanup();
  }
});

it("explains how to switch Safari on when it is installed but off", async () => {
  const view = await renderDialog("MacIntel", { state: "disabled", ...SIGNED });
  try {
    expect(view.text()).toContain("switched off in Safari");
    expect(view.buttons()).toContain("Open Safari Settings");
    expect(view.text()).toContain("Turn on Pond.");
  } finally {
    await view.cleanup();
  }
});

it("opens Safari's settings at the extension", async () => {
  const view = await renderDialog("MacIntel", { state: "disabled", ...SIGNED });
  try {
    await view.click("Open Safari Settings");
    expect(view.calls).toContain("extension.openSafariSettings");
    expect(view.calls).not.toContain("extension.openSafari");
  } finally {
    await view.cleanup();
  }
});

it("blames the code signature when Safari ignores an unsigned build", async () => {
  const view = await renderDialog("MacIntel", {
    state: "not_registered",
    bundleId: "so.pond.desktop.Extension",
    signature: "ad-hoc",
  });
  try {
    expect(view.text()).toContain("Safari ignores unsigned builds");
  } finally {
    await view.cleanup();
  }
});

it("falls back to Allow unsigned extensions when Safari refuses the call", async () => {
  const view = await renderDialog(
    "MacIntel",
    {
      state: "not_registered",
      bundleId: "so.pond.desktop.Extension",
      signature: "ad-hoc",
    },
    {
      ok: false,
      reason: "unsigned-build",
      error:
        "Safari hides extensions from unsigned builds until you allow them in its Developer settings.",
    },
  );
  try {
    await view.click("Open Safari Settings");
    expect(view.text()).toContain("Allow unsigned extensions");
    /** Keeps the user moving instead of leaving the button looking broken. */
    expect(view.calls).toContain("extension.openSafari");
  } finally {
    await view.cleanup();
  }
});

it("keeps a signed build off the unsigned steps when Safari refuses", async () => {
  const view = await renderDialog(
    "MacIntel",
    { state: "disabled", ...SIGNED },
    {
      ok: false,
      reason: "safari-refused",
      error:
        "Safari didn't open Pond's settings. Turn Pond on in Safari, under Extensions.",
    },
  );
  try {
    await view.click("Open Safari Settings");
    expect(view.text()).toContain("Turn Pond on in Safari, under Extensions.");
    expect(view.text()).toContain("Turn on Pond.");
    expect(view.text()).not.toContain("Allow unsigned extensions");
    expect(view.calls).toContain("extension.openSafari");
  } finally {
    await view.cleanup();
  }
});

it("asks a signed build Safari has not listed yet to open Safari once", async () => {
  const view = await renderDialog("MacIntel", {
    state: "not_registered",
    ...SIGNED,
  });
  try {
    expect(view.text()).toContain("Open Safari once to finish setting it up");
    expect(view.text()).not.toContain("unsigned");
  } finally {
    await view.cleanup();
  }
});

it("says so when the build carries no appex", async () => {
  const view = await renderDialog("MacIntel", {
    state: "not_bundled",
    bundleId: null,
    signature: "unknown",
  });
  try {
    expect(view.text()).toContain("Not included in this build");
    expect(view.buttons()).not.toContain("Open Safari Settings");
  } finally {
    await view.cleanup();
  }
});

it("hides the Safari row off macOS", async () => {
  const view = await renderDialog("Linux x86_64", {
    state: "enabled",
    ...SIGNED,
  });
  try {
    expect(view.text()).not.toContain("Safari");
    expect(view.calls).not.toContain("extension.safariStatus");
  } finally {
    await view.cleanup();
  }
});
