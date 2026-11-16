import { $convertToMarkdownString } from "@lexical/mdast";
import { Dialog } from "@pond/ui";
import type { AssistantSource } from "@shared/assistant";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  getNearestEditorFromDOMNode,
  UNDO_COMMAND,
} from "lexical";
import { act, createRef, type Ref, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ComposerView } from "../composer-view";
import { ComposerEditor, type ComposerEditorHandle } from "./";

const send = vi.fn();
const search = vi.fn();
const save: AssistantSource = {
  id: "film",
  title: "Suspiria",
  url: "https://example.com/film",
  source: "arena",
};
let host: HTMLDivElement;
let root: Root;
function Harness({
  initial = "",
  running = false,
  handle,
}: {
  initial?: string;
  running?: boolean;
  handle?: Ref<ComposerEditorHandle>;
}) {
  const [value, setValue] = useState(initial);
  const [attachments, setAttachments] = useState<AssistantSource[]>([]);
  const anchorRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={anchorRef}>
        <ComposerView
          onSend={() => send(value)}
          editor={
            <ComposerEditor
              ref={handle}
              value={value}
              onChange={setValue}
              disabled={false}
              running={running}
              placeholder="Ask about your Saves"
              anchorRef={anchorRef}
              attachments={attachments}
              onAttach={(saves) =>
                setAttachments((current) => [...current, ...saves])
              }
              onRemove={(id) =>
                setAttachments((current) =>
                  current.filter((item) => item.id !== id),
                )
              }
              onSend={send}
              onDropIds={() => {}}
            />
          }
        />
      </div>
      <Dialog.Host />
      <output>{value}</output>
      <aside>{attachments.map((item) => item.title).join(", ")}</aside>
      <button type="button" onClick={() => setValue("Restored **draft**")}>
        Restore draft
      </button>
    </>
  );
}
function editable() {
  const node = host.querySelector<HTMLElement>('[contenteditable="true"]');
  if (!node) throw new Error("Missing composer");
  return node;
}
function editor() {
  const instance = getNearestEditorFromDOMNode(editable());
  if (!instance) throw new Error("Missing editor");
  return instance;
}
function markdown() {
  return editor().read(() => $convertToMarkdownString());
}
async function type(text: string) {
  await act(async () => {
    editable().focus();
    editor().update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(text);
      else $getRoot().selectEnd().insertText(text);
    });
  });
}
async function press(key: string, options: KeyboardEventInit = {}) {
  await act(async () => {
    editable().dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...options,
      }),
    );
  });
}
async function mount(initial = "", running = false) {
  await act(async () =>
    root.render(<Harness initial={initial} running={running} />),
  );
}

beforeEach(() => {
  vi.stubGlobal("scrollBy", () => {});
  vi.stubGlobal("pond", { query: search });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(0, 0, 40, 16),
  });
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: () => {},
  });
  send.mockClear();
  search.mockReset().mockResolvedValue({ saves: [save] });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("renders and round-trips document Markdown without fetching remote images", async () => {
  await mount(
    "# Brief\n\n**Bold** and *italic* with [a link](https://example.com).\n\n- one\n- two\n\n- [x] done\n\n> quote\n\n```js\nconst size = 13;\n```\n\n| Name | Size |\n| --- | --- |\n| Body | 13 |\n\n![remote](https://example.com/image.png)",
  );
  expect(editable().querySelectorAll("li")).toHaveLength(3);
  expect(editable().querySelector("table")).not.toBeNull();
  expect(editable().querySelector("img")).toBeNull();
  expect(markdown()).toContain("**Bold**");
  expect(markdown()).toContain("const size = 13;");
  expect(markdown()).toContain("- [x] done");
});

it("selects a slash command with Enter and continues the list with Shift+Enter", async () => {
  await mount();
  await type("/bullet");
  expect(document.querySelector('[role="option"]')?.textContent).toContain(
    "Bulleted List",
  );
  await press("Enter");
  expect(send).not.toHaveBeenCalled();
  await type("First bullet");
  await press("Enter", { shiftKey: true });
  await type("Second bullet");
  expect(editable().querySelectorAll("li")).toHaveLength(2);
  await press("Enter");
  expect(send).toHaveBeenCalledWith("- First bullet\n- Second bullet");
});

it("inserts an editable table, then retains its Markdown in the draft", async () => {
  await mount();
  await type("/table");
  await press("Enter");
  expect(editable().querySelectorAll("tr")).toHaveLength(3);
  await type("Title");
  await press("Tab");
  await type("Size");
  expect(markdown()).toMatch(/\| Title\s+\| Size/);
  expect(host.querySelector("output")?.textContent).toBe(markdown());
});

it("keeps code newlines and literal slash text inside code", async () => {
  await mount();
  await type("/code");
  await press("Enter");
  await type("const size = 13;");
  await press("Enter", { shiftKey: true });
  await type("/table");
  expect(markdown()).toContain("const size = 13;\n/table");
  expect(document.querySelector('[role="option"]')).toBeNull();
  await press("Enter");
  expect(send).toHaveBeenCalledWith(expect.stringContaining("```"));
});

it("inserts a Save mention chip from @ and keeps it in the draft", async () => {
  await mount();
  await type("Compare @sus");
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 180));
  });
  expect(search).toHaveBeenCalledWith("agent.searchSaves", {
    query: "sus",
    limit: 12,
  });
  await press("Enter");
  expect(host.querySelector("aside")?.textContent).toBe("Suspiria");
  expect(editable().textContent).toContain("Compare");
  expect(editable().textContent).toContain("Suspiria");
  expect(markdown()).toContain("[Suspiria](pond-save:film)");
  expect(send).not.toHaveBeenCalled();
});

it("opens the Save search when Add Saves types @ after a word", async () => {
  const handle = createRef<ComposerEditorHandle>();
  await act(async () => root.render(<Harness handle={handle} />));
  await type("Compare");
  await act(async () => handle.current?.mention());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 180));
  });
  expect(editable().textContent).toBe("Compare @");
  expect(search).toHaveBeenCalledWith("agent.searchSaves", {
    query: "",
    limit: 12,
  });
});

it("restores a Save mention from draft Markdown", async () => {
  await mount("Compare [Suspiria](pond-save:film)");
  expect(editable().textContent).toContain("Suspiria");
  expect(markdown()).toContain("[Suspiria](pond-save:film)");
});

it("limits slash commands to formatting", async () => {
  await mount();
  await type("/");
  expect(document.body.textContent).toContain("Bulleted List");
  expect(document.body.textContent).not.toContain("Attach Saves");
  expect(document.body.textContent).not.toContain("Connect Ideas");
});

it("does not send during IME composition or while a response is running", async () => {
  await mount("Draft", true);
  await press("Enter");
  expect(send).not.toHaveBeenCalled();
  await mount("Draft", false);
  await press("Enter", { isComposing: true });
  expect(send).not.toHaveBeenCalled();
});

it("restores external Markdown without stealing focus or undoing into the old draft", async () => {
  await mount();
  await type("Old draft");
  const button = [...host.querySelectorAll("button")].find(
    (node) => node.textContent === "Restore draft",
  );
  await act(async () => {
    button?.focus();
    button?.click();
  });
  expect(markdown()).toBe("Restored **draft**");
  expect(document.activeElement).toBe(button);
  await act(async () => {
    editor().dispatchCommand(UNDO_COMMAND, undefined);
  });
  expect(markdown()).toBe("Restored **draft**");
});

it("serializes selection formatting instead of losing it on submit", async () => {
  await mount();
  await type("Hello");
  await act(async () => {
    editor().update(() => {
      $getRoot().select(0, $getRoot().getChildrenSize());
    });
    editor().dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
  });
  await press("Enter");
  expect(send).toHaveBeenCalledWith("**Hello**");
});

it("dismisses commands with Escape and does not send an empty search", async () => {
  await mount();
  await type("/no-such-command");
  await press("Enter");
  expect(send).not.toHaveBeenCalled();
  await press("Escape");
  expect(editable().hasAttribute("aria-controls")).toBe(false);
  expect(editable().textContent).toBe("/no-such-command");
});

it("does not select a slash command when Enter commits IME composition", async () => {
  await mount();
  await type("/bullet");
  await press("Enter", { isComposing: true });
  expect(editable().textContent).toBe("/bullet");
  expect(send).not.toHaveBeenCalled();
});

it("pastes Markdown as blocks and pastes literal text within code", async () => {
  class PasteEvent extends Event {
    clipboardData: { getData: (type: string) => string };
    constructor(text: string) {
      super("paste", { bubbles: true, cancelable: true });
      this.clipboardData = {
        getData: (type) => (type === "text/plain" ? text : ""),
      };
    }
  }
  vi.stubGlobal("ClipboardEvent", PasteEvent);
  await mount();
  await act(async () => {
    editable().focus();
    editable().dispatchEvent(new PasteEvent("## Brief\n\n- **one**\n- two"));
  });
  expect(editable().querySelector("h2")?.textContent).toBe("Brief");
  expect(editable().querySelectorAll("li")).toHaveLength(2);
  await act(async () => {
    editor().update(() => {
      $getRoot().select(0, $getRoot().getChildrenSize());
    });
  });
  await type("/code");
  await press("Enter");
  await act(async () => {
    editable().dispatchEvent(new PasteEvent("**literal**\n- literal"));
  });
  expect(markdown()).toContain("**literal**\n- literal");
  expect(editable().querySelector("li")).toBeNull();
});

it("applies a link to the selected text with the document-style shortcut", async () => {
  await mount();
  await type("Example");
  await act(async () => {
    editor().update(() => {
      $getRoot().select(0, $getRoot().getChildrenSize());
    });
  });
  await press("k", { code: "KeyK", ctrlKey: true });
  const field = document.querySelector<HTMLInputElement>(
    'input[placeholder="https://example.com"]',
  );
  expect(field).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(field, "https://example.com");
    field?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const apply = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Apply",
  );
  await act(async () => {
    apply?.click();
  });
  expect(markdown()).toBe("[Example](https://example.com)");
});

it("does not leak typing keys to page hotkeys", async () => {
  await mount();
  let leaked = false;
  const onKey = () => {
    leaked = true;
  };
  document.addEventListener("keydown", onKey);
  try {
    await press("[");
    expect(leaked).toBe(false);
  } finally {
    document.removeEventListener("keydown", onKey);
  }
});
