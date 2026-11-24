import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResponseError, responseErrorCopy } from ".";

let host: HTMLDivElement;
let root: Root;
const openExternal = vi.fn(async () => ({ ok: true }));

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal("pond", { openExternal });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  openExternal.mockClear();
  vi.unstubAllGlobals();
});

it("turns a raw OpenAI billing failure into actionable copy", () => {
  expect(
    responseErrorCopy(
      "Failed after 3 attempts. Last error: AI_APICallError: You have no credits remaining. Add credits at https://platform.openai.com/settings/organization/billing/.",
    ),
  ).toEqual({
    title: "No API credits remaining",
    description:
      "Add credits in your provider's billing settings, then try again.",
    action: {
      label: "Open Billing",
      url: "https://platform.openai.com/settings/organization/billing/",
    },
  });
});

it("renders actionable copy and opens billing", async () => {
  const error =
    "AI_APICallError: You have no credits remaining. https://platform.openai.com/settings/organization/billing/";
  await act(async () => root.render(<ResponseError error={error} />));

  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "No API credits remaining",
  );
  expect(host.textContent).not.toContain("Technical Details");
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((button) => button.textContent === "Open Billing")
      ?.click(),
  );
  expect(openExternal).toHaveBeenCalledExactlyOnceWith(
    "https://platform.openai.com/settings/organization/billing/",
  );
});

it("uses a clear fallback for unknown provider failures", () => {
  expect(responseErrorCopy("Connection reset by peer")).toEqual({
    title: "Couldn't finish this response",
    description: "Check your provider in Providers, then try again.",
    action: { label: "Open Providers", settings: true },
  });
});
