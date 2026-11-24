import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { PrefsSchema } from "@pond/schema";
import type { LexicalEditor } from "lexical";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetFilters,
  setSearchInput,
  useFilterQuery,
  useSearchInput,
} from "@/features/library";
import { SearchComposer } from "./";
import { $writeSearchString } from "./lib/editor-state";

interface Harness {
  editor: LexicalEditor | null;
}

const harness: Harness = { editor: null };
function CaptureEditor() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    harness.editor = editor;
    return () => {
      harness.editor = null;
    };
  }, [editor]);
  return null;
}

function SearchState() {
  return (
    <>
      <output>{useSearchInput()}</output>
      <output data-filter-state>{JSON.stringify(useFilterQuery())}</output>
    </>
  );
}

describe("search editor synchronization", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("pond", {
      query: async (name: string) =>
        name === "settings.getPrefs" ? PrefsSchema.parse({}) : [],
      onSyncAction: () => () => {},
      onSyncStatus: () => () => {},
      onSaveUpdated: () => () => {},
    });
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(),
    });
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [],
    });
    resetFilters();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("updates a mounted editor from menu selections without stealing focus", async () => {
    await act(async () => {
      root.render(
        <>
          <SearchComposer>
            <CaptureEditor />
          </SearchComposer>
          <button type="button">Filter</button>
          <SearchState />
        </>,
      );
    });
    const trigger = host.querySelector<HTMLButtonElement>(
      "button:last-of-type",
    );
    trigger?.focus();
    await act(async () => {
      setSearchInput(
        [{ field: "type", operator: "in", value: ["image", "video"] }],
        "design",
        "type:image,video design",
      );
    });
    expect(
      host.querySelector("[data-library-search]")?.textContent?.trim(),
    ).toBe("type:image,video design");
    expect(host.querySelector("output")?.textContent).toBe(
      "type:image,video design",
    );
    expect(document.activeElement).toBe(trigger);

    await act(async () => setSearchInput([], "design", "design"));
    expect(
      host.querySelector("[data-library-search]")?.textContent?.trim(),
    ).toBe("design");
    expect(host.querySelector("output")?.textContent).toBe("design");
  });

  it("clears the existing editor when filters are reset outside search", async () => {
    setSearchInput(
      [{ field: "tags", operator: "some", value: ["design"] }],
      "",
      "tag:design",
    );
    await act(async () =>
      root.render(
        <SearchComposer>
          <CaptureEditor />
        </SearchComposer>,
      ),
    );
    expect(
      host.querySelector("[data-library-search]")?.textContent?.trim(),
    ).toBe("tag:design");
    await act(async () => resetFilters());
    expect(
      host.querySelector("[data-library-search]")?.textContent?.trim(),
    ).toBe("");
  });

  it("keeps Enter as keyword search without turning words into filters", async () => {
    const rule = {
      field: "source" as const,
      operator: "eq" as const,
      value: "youtube.com",
    };
    setSearchInput([rule], "videos from last week", "videos from last week");
    await act(async () =>
      root.render(
        <>
          <SearchComposer>
            <CaptureEditor />
          </SearchComposer>
          <SearchState />
        </>,
      ),
    );
    const input = host.querySelector<HTMLElement>("[data-library-search]");
    await act(async () =>
      input?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(input?.textContent?.trim()).toBe("videos from last week");
    expect(host.querySelector("output")?.textContent).toBe(
      "videos from last week",
    );
    expect(
      JSON.parse(host.querySelector("[data-filter-state]")?.textContent ?? "{}")
        .rules,
    ).toEqual([rule]);
  });

  it("keeps toolbar filters while typing and clearing keyword search", async () => {
    const rule = {
      field: "source" as const,
      operator: "eq" as const,
      value: "youtube.com",
    };
    setSearchInput([rule], "", "");
    await act(async () =>
      root.render(
        <>
          <SearchComposer>
            <CaptureEditor />
          </SearchComposer>
          <SearchState />
        </>,
      ),
    );
    const input = host.querySelector<HTMLElement>("[data-library-search]");
    expect(input?.textContent?.trim()).toBe("");
    await act(async () =>
      harness.editor?.update(() => $writeSearchString("cats")),
    );
    expect(input?.textContent?.trim()).toBe("cats");
    expect(
      JSON.parse(host.querySelector("[data-filter-state]")?.textContent ?? "{}")
        .rules,
    ).toEqual([rule]);
    await act(async () => harness.editor?.update(() => $writeSearchString("")));
    expect(input?.textContent?.trim()).toBe("");
    expect(
      JSON.parse(host.querySelector("[data-filter-state]")?.textContent ?? "{}")
        .rules,
    ).toEqual([rule]);
  });

  it("treats field:value text as keywords, not filters", async () => {
    await act(async () =>
      root.render(
        <>
          <SearchComposer>
            <CaptureEditor />
          </SearchComposer>
          <SearchState />
        </>,
      ),
    );
    await act(async () =>
      harness.editor?.update(() => $writeSearchString("type:video")),
    );
    expect(
      host.querySelector("[data-library-search]")?.textContent?.trim(),
    ).toBe("type:video");
    expect(host.querySelector("output")?.textContent).toBe("type:video");
    expect(
      JSON.parse(host.querySelector("[data-filter-state]")?.textContent ?? "{}")
        .rules,
    ).toEqual([]);
  });
});
