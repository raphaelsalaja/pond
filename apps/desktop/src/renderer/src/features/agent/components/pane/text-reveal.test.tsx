import { useTextReveal } from "@pond/ui";
import type { TextRevealFrames } from "@pond/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

function Probe({
  content,
  animate,
  finish,
  clock,
}: {
  content: string;
  animate: boolean;
  finish: boolean;
  clock: TextRevealFrames;
}) {
  const { text, pending } = useTextReveal(content, animate, finish, clock);
  return <output data-pending={pending}>{text}</output>;
}

function createReveal() {
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  let now = 0;
  const clock: TextRevealFrames = {
    now: () => now,
    request: (callback) => {
      frames.set(++nextId, callback);
      return nextId;
    },
    cancel: (id) => {
      frames.delete(id);
    },
  };
  const host = document.createElement("div");
  const root = createRoot(host);
  let mounted = true;
  const unmount = async () => {
    if (!mounted) {
      return;
    }
    await act(async () => root.unmount());
    mounted = false;
  };
  cleanups.push(unmount);
  return {
    get text() {
      return host.textContent ?? "";
    },
    get pending() {
      return host.querySelector("output")?.dataset.pending === "true";
    },
    get scheduled() {
      return frames.size;
    },
    async render(content: string, animate: boolean, finish = false) {
      await act(async () =>
        root.render(
          <Probe
            content={content}
            animate={animate}
            finish={finish}
            clock={clock}
          />,
        ),
      );
    },
    async advance(milliseconds = 16) {
      now += milliseconds;
      const callbacks = [...frames.values()];
      frames.clear();
      await act(async () => {
        for (const callback of callbacks) {
          callback(now);
        }
      });
    },
    unmount,
  };
}

it("shows historical text immediately without scheduling a replay", async () => {
  const reveal = createReveal();
  await reveal.render("An already saved answer.", false);
  expect(reveal.text).toBe("An already saved answer.");
  expect(reveal.pending).toBe(false);
  expect(reveal.scheduled).toBe(0);
  await reveal.render("A different historical answer.", false);
  expect(reveal.text).toBe("A different historical answer.");
  expect(reveal.scheduled).toBe(0);
});

it("reveals Unicode letters on animation frames without splitting a code point", async () => {
  const reveal = createReveal();
  await reveal.render("🌿Pond", true);
  expect(reveal.text).toBe("");
  expect(reveal.pending).toBe(true);
  await reveal.advance();
  expect(reveal.text).toBe("🌿");
  await reveal.advance();
  expect(reveal.text).toBe("🌿P");
  for (let frame = 0; frame < 4; frame++) {
    await reveal.advance();
  }
  expect(reveal.text).toBe("🌿Pond");
  expect(reveal.pending).toBe(false);
  expect(reveal.scheduled).toBe(0);
});

it("drains the final received text after the model completes without jumping to the end", async () => {
  const reveal = createReveal();
  await reveal.render("A short", true);
  await reveal.advance();
  const first = reveal.text;
  await reveal.render("A short answer with saved references.", false);
  expect(reveal.text).toBe(first);
  expect(reveal.pending).toBe(true);
  await reveal.advance();
  expect(reveal.text.length).toBeGreaterThan(first.length);
  expect(reveal.text).not.toBe("A short answer with saved references.");
  for (let frame = 0; frame < 40 && reveal.pending; frame++) {
    await reveal.advance();
  }
  expect(reveal.text).toBe("A short answer with saved references.");
  expect(reveal.pending).toBe(false);
});

it("replaces unrelated content without concatenating a stale revealed prefix", async () => {
  const reveal = createReveal();
  await reveal.render("First", true);
  await reveal.advance();
  expect(reveal.text).toBe("F");
  await reveal.render("Replacement", true);
  expect(reveal.text).toBe("Replacement");
  await reveal.advance();
  await reveal.render("Replacement continued", true);
  for (let frame = 0; frame < 30 && reveal.pending; frame++) {
    await reveal.advance();
  }
  expect(reveal.text).toBe("Replacement continued");
  expect(reveal.pending).toBe(false);
});

it("catches up after a delayed frame progressively and cancels pending work on unmount", async () => {
  const reveal = createReveal();
  const content = "A long answer. ".repeat(100);
  await reveal.render(content, true);
  await reveal.advance(1000);
  expect(reveal.text.length).toBeGreaterThan(1);
  expect(reveal.text.length).toBeLessThan(content.length);
  expect(content.startsWith(reveal.text)).toBe(true);
  expect(reveal.scheduled).toBe(1);
  await reveal.unmount();
  expect(reveal.scheduled).toBe(0);
  await reveal.advance();
  expect(reveal.scheduled).toBe(0);
});

it.each([true, false])(
  "finishes buffered stopped or failed content immediately when the run is active=%s",
  async (animate) => {
    const reveal = createReveal();
    const content = "An interrupted answer that was already received.";
    await reveal.render(content, true);
    await reveal.advance();
    expect(reveal.pending).toBe(true);
    expect(reveal.scheduled).toBe(1);
    await reveal.render(content, animate, true);
    expect(reveal.text).toBe(content);
    expect(reveal.pending).toBe(false);
    expect(reveal.scheduled).toBe(0);
    await reveal.advance();
    expect(reveal.text).toBe(content);
  },
);

it("opens an already stopped response without briefly hiding or replaying its text", async () => {
  const reveal = createReveal();
  await reveal.render("The saved partial answer.", false, true);
  expect(reveal.text).toBe("The saved partial answer.");
  expect(reveal.pending).toBe(false);
  expect(reveal.scheduled).toBe(0);
});
