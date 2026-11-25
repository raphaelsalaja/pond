import { TokenInput } from "@pond/ui/token-input";
import type { AssistantSource } from "@shared/assistant";
import { act, createRef, type Ref, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ComposerView } from "../composer-view";
import { ComposerEditor, type ComposerEditorHandle } from "./";
import { saveMentionCodec } from "./mention";

const send = vi.fn();
const queue = vi.fn();
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
              onQueue={queue}
              onDropIds={() => {}}
            />
          }
        />
      </div>
      <output>{value}</output>
      <aside>{attachments.map((item) => item.title).join(", ")}</aside>
      <button type="button" onClick={() => setValue("Restored draft")}>
        Restore draft
      </button>
      <button type="button" onClick={() => setAttachments([save])}>
        Attach Suspiria
      </button>
    </>
  );
}

function editable() {
  const node = host.querySelector<HTMLElement>('[role="textbox"]');
  if (!node) throw new Error("Missing composer");
  return node;
}

function output() {
  return host.querySelector("output")?.textContent ?? "";
}

async function click(name: string) {
  const button = [...host.querySelectorAll("button")].find(
    (item) => item.textContent === name,
  );
  if (!button) throw new Error(`Missing ${name}`);
  await act(async () => button.click());
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
  vi.stubGlobal("pond", { query: search });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  send.mockClear();
  queue.mockClear();
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

it("writes Save mentions as pond-save links and reads them back", () => {
  const value = TokenInput.fromText(
    "Compare [Suspiria \\[1977\\]](pond-save:film%2F1) and [Inferno](pond-save:inferno).",
    saveMentionCodec,
  );
  expect(value).toEqual([
    "Compare ",
    { type: "save", value: "film/1", label: "Suspiria [1977]" },
    " and ",
    { type: "save", value: "inferno", label: "Inferno" },
    ".",
  ]);
  expect(TokenInput.toText(value, saveMentionCodec)).toBe(
    "Compare [Suspiria \\[1977\\]](pond-save:film%2F1) and [Inferno](pond-save:inferno).",
  );
});

it("leaves ordinary Markdown links as text", () => {
  expect(
    TokenInput.fromText("See [docs](https://example.com)", saveMentionCodec),
  ).toEqual(["See [docs](https://example.com)"]);
});

it("restores a Save mention chip from draft Markdown", async () => {
  await mount("Watch [Suspiria](pond-save:film) tonight");
  expect(editable().textContent).toContain("Suspiria");
  expect(editable().textContent).toContain("tonight");
  expect(output()).toBe("Watch [Suspiria](pond-save:film) tonight");
});

it("inserts a chip for a Save attached from outside and drafts its link", async () => {
  await mount("Compare ");
  await click("Attach Suspiria");
  expect(editable().textContent).toContain("Suspiria");
  expect(output()).toContain("[Suspiria](pond-save:film)");
});

it("sends the draft as Markdown with Enter", async () => {
  await mount("Watch [Suspiria](pond-save:film)");
  await press("Enter");
  expect(send).toHaveBeenCalledWith("Watch [Suspiria](pond-save:film)");
});

it("queues instead of sending while a reply runs, and waits for IME composition", async () => {
  await mount("Draft", true);
  await press("Enter");
  expect(send).not.toHaveBeenCalled();
  expect(queue).toHaveBeenCalledWith("Draft");
  queue.mockClear();
  await mount("Draft", false);
  await press("Enter", { isComposing: true });
  expect(send).not.toHaveBeenCalled();
});

it("restores an external draft", async () => {
  await mount("Old draft");
  await click("Restore draft");
  expect(editable().textContent).toContain("Restored draft");
  expect(output()).toBe("Restored draft");
});

it("opens the Save search from the Add Saves handle", async () => {
  const handle = createRef<ComposerEditorHandle>();
  await act(async () =>
    root.render(<Harness initial="Compare" handle={handle} />),
  );
  await act(async () => handle.current?.mention());
  expect(output()).toContain("@");
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
