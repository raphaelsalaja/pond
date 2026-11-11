import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibrarySettings } from ".";

const customLogo = "data:image/png;base64,Y3VzdG9t";
const customSource = "data:image/png;base64,c291cmNl";
interface LibraryInfo {
  path: string;
  name: string;
  icon: string | null;
  accent: string;
}

let libraryInfo: LibraryInfo = {
  path: "/Users/rafa/My Pond.pond",
  name: "My Pond",
  icon: null,
  accent: "#008FFF",
};

const query = vi.fn(
  async (
    name: string,
    params: { name?: string; icon?: string | null } = {},
  ) => {
    if (name === "library.info") return libraryInfo;
    if (name === "library.recent") return [];
    if (name === "library.identity.pickIcon") {
      return {
        ok: true,
        image: { src: customSource, width: 300, height: 900 },
      };
    }
    if (name === "library.identity.cropIcon") {
      return { ok: true, icon: customLogo };
    }
    if (name === "library.identity.update") {
      libraryInfo = { ...libraryInfo, ...params };
      return { ok: true, ...libraryInfo };
    }
    if (name === "library.rename") {
      libraryInfo = { ...libraryInfo, name: params.name ?? libraryInfo.name };
      return { ok: true, path: libraryInfo.path };
    }
    return { ok: true };
  },
);

describe("library settings", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    libraryInfo = {
      path: "/Users/rafa/My Pond.pond",
      name: "My Pond",
      icon: null,
      accent: "#008FFF",
    };
    query.mockClear();
    vi.stubGlobal("pond", { query });
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
      expect(choose instanceof HTMLButtonElement && choose.disabled).toBe(
        false,
      );
      expect(name instanceof HTMLInputElement && name.disabled).toBe(false);
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
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
    if (!(choose instanceof HTMLButtonElement))
      throw new Error("Missing Choose Logo button");
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
    expect(query).toHaveBeenCalledWith("library.identity.cropIcon", {
      src: customSource,
      crop: { x: 0, y: 300, size: 300 },
    });
    await vi.waitFor(() =>
      expect(query).toHaveBeenCalledWith("library.identity.update", {
        icon: customLogo,
      }),
    );

    const reset = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Reset",
    );
    if (!reset) throw new Error("Missing Reset button");
    await act(async () => reset.click());
    await vi.waitFor(() =>
      expect(query).toHaveBeenCalledWith("library.identity.update", {
        icon: null,
      }),
    );
  });

  it("renames the library when the name field loses focus", async () => {
    const field = host.querySelector('[aria-label="Library Name"]');
    if (!(field instanceof HTMLInputElement))
      throw new Error("Missing Library Name field");
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
    await vi.waitFor(() =>
      expect(query).toHaveBeenCalledWith("library.rename", {
        name: "Archive",
      }),
    );
  });
});
