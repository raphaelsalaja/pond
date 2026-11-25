import { isHTMLTag } from "@pond/ui/dom";
import type { QueryInput, QueryResult } from "@shared/query-contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { LibrarySettings } from ".";

const customLogo = "data:image/png;base64,Y3VzdG9t";
const customSource = "data:image/png;base64,c291cmNl";

let libraryInfo: QueryResult<"library.info">;
let updated: PromiseWithResolvers<QueryInput<"library.identity.update">>;
let renamed: PromiseWithResolvers<QueryInput<"library.rename">>;

describe("library settings", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    libraryInfo = {
      path: "/Users/rafa/My Pond.pond",
      name: "My Pond",
      icon: null,
      mark: null,
      accent: "#008FFF",
    };
    updated = Promise.withResolvers();
    renamed = Promise.withResolvers();
    bridge.use({
      query: {
        "library.info": () => libraryInfo,
        "library.recent": () => [],
        "library.identity.pickIcon": () => ({
          ok: true,
          image: { src: customSource, width: 300, height: 900 },
        }),
        "library.identity.cropIcon": () => ({ ok: true, icon: customLogo }),
        "library.identity.update": (input) => {
          libraryInfo = { ...libraryInfo, ...input };
          updated.resolve(input ?? {});
          return { ok: true, ...libraryInfo };
        },
        "library.rename": (input) => {
          libraryInfo = { ...libraryInfo, name: input.name };
          renamed.resolve(input);
          return { ok: true, path: libraryInfo.path };
        },
      },
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <LibrarySettings />
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => {
      const choose = host.querySelector('[aria-label="Choose Logo"]');
      const name = host.querySelector('[aria-label="Library Name"]');
      expect(isHTMLTag(choose, "button") && choose.disabled).toBe(false);
      expect(isHTMLTag(name, "input") && name.disabled).toBe(false);
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("shows logo and name controls inline", () => {
    expect(host.textContent).toContain("Recommended size is 256 × 256 px.");
    expect(host.querySelector('[aria-label="Library Name"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="Choose Logo"] img')).toBeTruthy();
    expect(host.textContent).not.toContain("Customize Library");
    expect(host.textContent).not.toContain("Accent Color");
  });

  it("chooses and resets a logo", async () => {
    const choose = host.querySelector('[aria-label="Choose Logo"]');
    if (!isHTMLTag(choose, "button")) {
      throw new Error("Missing Choose Logo button");
    }
    await act(async () => choose.click());
    const crop = await vi.waitFor(() => {
      const button = [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[role="dialog"] button',
        ),
      ].find((candidate) => candidate.textContent?.trim() === "Crop");
      if (!button) throw new Error("Missing Crop button");
      return button;
    });
    await act(async () => crop.click());
    expect(window.pond.query).toHaveBeenCalledWith(
      "library.identity.cropIcon",
      { src: customSource, crop: { x: 0, y: 300, size: 300 } },
    );
    expect(await act(() => updated.promise)).toEqual({ icon: customLogo });

    updated = Promise.withResolvers();
    const reset = await vi.waitFor(() => {
      const button = [...host.querySelectorAll("button")].find(
        (candidate) => candidate.textContent === "Reset",
      );
      if (!button || button.disabled) {
        throw new Error("Missing Reset button");
      }
      return button;
    });
    await act(async () => reset.click());
    expect(await act(() => updated.promise)).toEqual({ icon: null });
  });

  it("renames the library when the name field loses focus", async () => {
    const field = host.querySelector('[aria-label="Library Name"]');
    if (!isHTMLTag(field, "input")) {
      throw new Error("Missing Library Name field");
    }
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(field, "Archive");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      field.focus();
      field.blur();
    });
    expect(await act(() => renamed.promise)).toEqual({ name: "Archive" });
  });
});
