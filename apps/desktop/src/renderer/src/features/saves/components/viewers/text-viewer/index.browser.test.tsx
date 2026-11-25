import { $createHeadingNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isTextNode,
  FORMAT_TEXT_COMMAND,
  getNearestEditorFromDOMNode,
  KEY_DOWN_COMMAND,
} from "lexical";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalise, SavePatchSchema } from "@/features/saves/lib/reconcile";
import { pool } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";
import { bridge } from "@/shared/test/pond-bridge";
import {
  NOTE_BODY_PLACEHOLDER,
  NOTE_TITLE_PLACEHOLDER,
  TextViewer,
} from "./index";
import { markdownFromEditor } from "./markdown";

function noteSave(partial: Partial<Save> = {}): Save {
  const save = normalise(
    SavePatchSchema.parse({
      id: "note",
      source: "local",
      sourceId: "note",
      url: "pond:local/note",
      title: null,
      description: null,
      mediaType: "text",
      files: [],
      tags: [],
      ...partial,
    }),
  );
  if (!save) {
    throw new Error("Fixture must produce a save");
  }
  return save;
}

function editorFromHost(root: HTMLElement) {
  const body = root.querySelector<HTMLElement>('[aria-label="Note"]');
  if (!body) {
    throw new Error("Missing note");
  }
  const editor = getNearestEditorFromDOMNode(body);
  if (!editor) {
    throw new Error("Missing editor");
  }
  return editor;
}

describe("text viewer", () => {
  let host: HTMLDivElement;
  let root: Root;
  let described: PromiseWithResolvers<void>;

  beforeEach(() => {
    pool.clear();
    described = Promise.withResolvers<void>();
    bridge.use({
      tx: async (transaction) => {
        if ("patch" in transaction && "description" in transaction.patch) {
          described.resolve();
        }
      },
      openExternal: async () => ({ ok: true }),
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    pool.clear();
  });

  it("shows Untitled and the body placeholder on a blank local note", async () => {
    const save = noteSave();
    pool.upsert(save);
    await act(async () => root.render(<TextViewer save={save} />));
    const title = host.querySelector<HTMLInputElement>(
      'input[aria-label="Title"]',
    );
    expect(title?.placeholder).toBe(NOTE_TITLE_PLACEHOLDER);
    expect(document.activeElement).toBe(title);
    expect(host.textContent).toContain(NOTE_BODY_PLACEHOLDER);
  });

  it("persists the title without writing Untitled", async () => {
    const save = noteSave();
    pool.upsert(save);
    await act(async () => root.render(<TextViewer save={save} />));
    const title = host.querySelector<HTMLInputElement>(
      'input[aria-label="Title"]',
    );
    if (!title) {
      throw new Error("Missing title");
    }
    await act(async () => {
      title.focus();
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(title, "Brief");
      title.dispatchEvent(new Event("input", { bubbles: true }));
      title.blur();
    });
    expect(window.pond.tx).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "note",
        patch: { title: "Brief" },
        meta: { actor: "user", actorReason: "user:rename" },
      }),
    );
  });

  it("persists markdown from the body editor", async () => {
    const save = noteSave();
    pool.upsert(save);
    await act(async () => root.render(<TextViewer save={save} />));
    const editor = editorFromHost(host);
    await act(async () => {
      editor.update(() => {
        const text = $createTextNode("Hello pond");
        const paragraph = $createParagraphNode();
        paragraph.append(text);
        $getRoot().clear();
        $getRoot().append(paragraph);
      });
    });
    await act(async () => {
      await described.promise;
    });
    expect(window.pond.tx).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "note",
        patch: { description: "Hello pond" },
        meta: { actor: "user", actorReason: "user:edit-description" },
      }),
    );
  });

  it("opens the slash menu for block commands", async () => {
    const save = noteSave();
    pool.upsert(save);
    await act(async () => root.render(<TextViewer save={save} />));
    const editor = editorFromHost(host);
    await act(async () => {
      editor.update(() => {
        const text = $createTextNode("/");
        const paragraph = $createParagraphNode();
        paragraph.append(text);
        $getRoot().clear();
        $getRoot().append(paragraph);
        text.selectEnd();
      });
    });
    expect(document.body.textContent).toContain("Heading 1");
    expect(document.body.textContent).toContain("Heading 4");
    expect(document.body.textContent).toContain("Checklist");
    expect(document.body.textContent).toContain("Insert Media");
    expect(document.body.textContent).toContain("YouTube");
    expect(document.body.textContent).toContain("Code Block");
    expect(document.body.textContent).toContain("Diagram");
    expect(document.body.textContent).toContain("Collapsible Section");
    expect(document.body.textContent).toContain("Blockquote");
    expect(document.body.textContent).toContain("Divider");
  });

  it("shows the format bubble for a text selection", async () => {
    const save = noteSave({ description: "Hello" });
    pool.upsert(save);
    await act(async () => root.render(<TextViewer save={save} />));
    const editor = editorFromHost(host);
    await act(async () => {
      editor.update(() => {
        const text = $getRoot().getFirstDescendant();
        if ($isTextNode(text)) {
          text.select(0, 5);
        }
      });
    });
    const labels = [...document.querySelectorAll("button")].map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        "Text Style",
        "Bold",
        "Italic",
        "Strikethrough",
        "Underline",
        "Link",
        "Quote",
        "Collapse",
        "Inline Code",
        "Code Block",
        "List",
      ]),
    );
    const style = [...document.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === "Text Style",
    );
    expect(style?.textContent).toContain("Aa");
  });

  it("swaps the text-style glyph for the heading level", async () => {
    const save = noteSave({ description: "Title" });
    pool.upsert(save);
    await act(async () => root.render(<TextViewer save={save} />));
    const editor = editorFromHost(host);
    await act(async () => {
      editor.update(() => {
        const text = $createTextNode("Title");
        const heading = $createHeadingNode("h1");
        heading.append(text);
        $getRoot().clear();
        $getRoot().append(heading);
        text.select(0, 5);
      });
    });
    const style = [...document.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === "Text Style",
    );
    expect(style?.textContent).not.toContain("Aa");
    expect(style?.getAttribute("aria-pressed")).toBe("true");
    expect(style?.querySelector("svg")).not.toBeNull();
  });

  it("swaps the format bubble into a link editor", async () => {
    const save = noteSave({ description: "Hello" });
    pool.upsert(save);
    await act(async () => root.render(<TextViewer save={save} />));
    const editor = editorFromHost(host);
    await act(async () => {
      editor.update(() => {
        const text = $getRoot().getFirstDescendant();
        if ($isTextNode(text)) {
          text.select(0, 5);
        }
      });
    });
    const link = [...document.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === "Link",
    );
    if (!link) {
      throw new Error("Missing Link");
    }
    await act(async () => {
      link.click();
    });
    const url = document.querySelector<HTMLInputElement>(
      'input[placeholder="Enter link URL"]',
    );
    expect(url).not.toBeNull();
    const labels = [...document.querySelectorAll("button")].map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(labels).toEqual(expect.arrayContaining(["Open", "Remove Link"]));
    expect(labels).not.toContain("Bold");
  });

  it("shows the linked URL when the selection is a link", async () => {
    const save = noteSave({ description: "[Hello](https://pond.app)" });
    pool.upsert(save);
    await act(async () => root.render(<TextViewer save={save} />));
    const editor = editorFromHost(host);
    await act(async () => {
      editor.update(() => {
        const text = $getRoot().getFirstDescendant();
        if ($isTextNode(text)) {
          text.select(0, 5);
        }
      });
    });
    const url = document.querySelector<HTMLInputElement>(
      'input[placeholder="Enter link URL"]',
    );
    expect(url?.value).toBe("https://pond.app");
    expect(
      [...document.querySelectorAll("button")].map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).not.toContain("Bold");
  });

  it("applies format shortcuts to the selection", async () => {
    const save = noteSave({ description: "Hello" });
    pool.upsert(save);
    await act(async () => root.render(<TextViewer save={save} />));
    const editor = editorFromHost(host);
    await act(async () => {
      editor.update(() => {
        const text = $getRoot().getFirstDescendant();
        if ($isTextNode(text)) {
          text.select(0, 5);
        }
      });
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
    });
    const bubble = [...document.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === "Bold",
    );
    expect(bubble?.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows a block drag handle on a local note", async () => {
    const save = noteSave({ description: "Hello" });
    pool.upsert(save);
    await act(async () => root.render(<TextViewer save={save} />));
    expect(host.querySelector('[aria-label="Move Block"]')).not.toBeNull();
  });

  it("moves the block at the caret with the keyboard and announces it", async () => {
    const save = noteSave();
    pool.upsert(save);
    await act(async () => root.render(<TextViewer save={save} />));
    const editor = editorFromHost(host);
    await act(async () => {
      editor.update(() => {
        const first = $createParagraphNode().append($createTextNode("First"));
        const second = $createParagraphNode().append($createTextNode("Second"));
        $getRoot().clear();
        $getRoot().append(first, second);
        second.selectEnd();
      });
    });
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", {
          key: "ArrowUp",
          metaKey: true,
          shiftKey: true,
          cancelable: true,
        }),
      );
    });
    expect(markdownFromEditor(editor).trim()).toBe("Second\n\nFirst");
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Moved block to position 1 of 2.",
    );
  });

  it("renders imported text without editor chrome", async () => {
    const save = noteSave({
      source: "web",
      title: "Imported",
      description: "Read me",
    });
    pool.upsert(save);
    await act(async () => root.render(<TextViewer save={save} />));
    expect(host.querySelector('input[aria-label="Title"]')).toBeNull();
    expect(host.textContent).toContain("Imported");
    expect(host.textContent).toContain("Read me");
    expect(host.textContent).not.toContain(NOTE_BODY_PLACEHOLDER);
    expect(host.querySelector('[contenteditable="true"]')).toBeNull();
    expect(host.querySelector('[aria-label="Move Block"]')).toBeNull();
  });

  it("removes the slash query when inserting a collapsible", async () => {
    const save = noteSave();
    pool.upsert(save);
    await act(async () => root.render(<TextViewer save={save} />));
    const editor = editorFromHost(host);
    await act(async () => {
      editor.update(() => {
        const text = $createTextNode("/col");
        const paragraph = $createParagraphNode();
        paragraph.append(text);
        $getRoot().clear();
        $getRoot().append(paragraph);
        text.selectEnd();
      });
    });
    const option = [...document.querySelectorAll('[role="option"]')].find(
      (item) => item.textContent?.includes("Collapsible Section"),
    );
    if (!option) {
      throw new Error("Missing Collapsible Section");
    }
    await act(async () => {
      option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(markdownFromEditor(editor)).toContain(":::collapse");
    expect(markdownFromEditor(editor)).not.toContain("/col");
  });
});
