import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MotionConfig } from "motion/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { ProcessingStatusCard } from "./";
import styles from "./styles.module.css";

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "styles.module.css"),
  "utf8",
);

function styleClass(name: string | undefined): string {
  if (!name) throw new Error("Missing processing style");
  return name;
}

function button(host: HTMLElement, name: string) {
  return [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) =>
      element.textContent === name ||
      element.getAttribute("aria-label") === name,
  );
}

it("groups running tasks into one count with the breakdown on hover", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(
        <MotionConfig reducedMotion="always">
          <ProcessingStatusCard
            enabled
            status={{
              inflight: 2,
              activeKeys: new Set(["caption:save-1", "ocr:save-1"]),
              failedKeys: new Set(["sensitive-content:save-2"]),
            }}
            onCheck={async () => {}}
            onRepair={() => {}}
          />
        </MotionConfig>,
      );
    });
    expect(host.textContent).toContain("Processing your library");
    expect(host.textContent).toContain("2 tasks left");
    expect(host.textContent).not.toContain("couldn't finish");
    expect(button(host, "Task Details")).toBeDefined();
    expect(button(host, "Retry")).toBeUndefined();
    expect(button(host, "Check Library")?.disabled).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("offers a retry once processing stops with failures", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let calls = 0;
  try {
    await act(async () => {
      root.render(
        <ProcessingStatusCard
          enabled
          status={{
            inflight: 0,
            activeKeys: new Set(),
            failedKeys: new Set(["ocr:save-1", "caption:save-2"]),
          }}
          onCheck={async () => {
            calls += 1;
          }}
          onRepair={() => {}}
        />,
      );
    });
    expect(host.textContent).toContain("Processing needs attention");
    expect(host.textContent).toContain("2 tasks couldn't finish");
    expect(host.textContent).toContain("Text in Images");
    expect(host.textContent).toContain("save-1");
    expect(host.textContent).toContain("Image Captions");
    expect(host.textContent).toContain("save-2");
    expect(button(host, "Check Library")).toBeUndefined();
    expect(button(host, "Task Details")).toBeDefined();
    await act(async () => button(host, "Retry")?.click());
    expect(calls).toBe(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("names a save whose files are missing and opens repair", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let repaired = 0;
  try {
    await act(async () => {
      root.render(
        <MotionConfig reducedMotion="always">
          <ProcessingStatusCard
            enabled
            status={{
              inflight: 0,
              activeKeys: new Set(),
              failedKeys: new Set([
                "caption:01M6G9W0KWQJNCXVE71HCTPDDS",
                "clip:01M6G9W0KWQJNCXVE71HCTPDDS",
              ]),
              missingOriginals: [
                {
                  id: "01M6G9W0KWQJNCXVE71HCTPDDS",
                  title: "Screenshot From 2026-10-30 08-21-58.png",
                },
              ],
            }}
            onCheck={async () => {}}
            onRepair={() => {
              repaired += 1;
            }}
          />
        </MotionConfig>,
      );
    });
    expect(host.textContent).toContain(
      "Files missing for Screenshot From 2026-10-30 08-21-58.png.",
    );
    expect(host.textContent).not.toContain("couldn't finish");
    await act(async () => button(host, "Repair Invalid Content")?.click());
    expect(repaired).toBe(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("prevents duplicate checks and recovers when starting a check fails", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let calls = 0;
  let failCheck: (reason: Error) => void = () => {};
  const pending = new Promise<void>((_resolve, reject) => {
    failCheck = reject;
  });
  try {
    await act(async () => {
      root.render(
        <ProcessingStatusCard
          enabled
          status={{ inflight: 0, activeKeys: new Set(), failedKeys: new Set() }}
          onCheck={() => {
            calls += 1;
            return calls === 1 ? pending : Promise.resolve();
          }}
          onRepair={() => {}}
        />,
      );
    });
    const check = button(host, "Check Library");
    await act(async () => check?.click());
    expect(host.textContent).toContain("Checking your library");
    expect(check?.disabled).toBe(true);
    await act(async () => check?.click());
    expect(calls).toBe(1);
    await act(async () => failCheck(new Error("Unavailable")));
    expect(host.textContent).toContain("Couldn't check your library");
    await act(async () => button(host, "Retry")?.click());
    expect(calls).toBe(2);
    expect(host.textContent).toContain("Ready for new items");
    expect(host.textContent).not.toContain("up to date");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("samples grouped failures and caps the task tooltip", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const longTitle =
    "A very long X post title that should truncate instead of stretching the processing card across the window";
  const failures = Array.from({ length: 30 }, (_, index) => ({
    key: `clip:save-${index}`,
    saveId: `save-${index}`,
    title: index === 0 ? longTitle : `Visual post ${index}`,
    task: "clip",
    reason: "Couldn't finish",
  }));
  failures.push(
    {
      key: "ocr:other",
      saveId: "other",
      title: "Readable caption",
      task: "ocr",
      reason: "Couldn't finish",
    },
    {
      key: "caption:caption-1",
      saveId: "caption-1",
      title: "Needs a caption",
      task: "caption",
      reason: "Model unavailable",
    },
  );
  try {
    await act(async () => {
      root.render(
        <MotionConfig reducedMotion="always">
          <ProcessingStatusCard
            enabled
            status={{
              inflight: 0,
              activeKeys: new Set(),
              failedKeys: new Set(failures.map((failure) => failure.key)),
              failures,
            }}
            onCheck={async () => {}}
            onRepair={() => {}}
          />
        </MotionConfig>,
      );
    });
    expect(host.textContent).toContain("32 tasks couldn't finish");
    expect(host.textContent).toContain("Visual Similarity");
    expect(host.textContent).toContain("Text in Images");
    expect(host.textContent).toContain("Image Captions");
    expect(host.textContent).toContain(longTitle);
    expect(host.textContent).toContain("Visual post 4");
    expect(host.textContent).toContain("Readable caption");
    expect(host.textContent).toContain("Model unavailable");
    expect(host.textContent).not.toContain("Visual post 5");
    expect(host.textContent).not.toContain("Couldn't finish");
    const title = [...host.querySelectorAll("span")].find(
      (element) => element.textContent === longTitle,
    );
    expect(title?.classList.contains(styleClass(styles.saveTitle))).toBe(true);
    expect(css).toMatch(
      /\.saveTitle\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
    );
    expect(css).toMatch(/\.action\s*\{[^}]*align-self:\s*start;/s);
    expect(css).toMatch(
      /\.breakdown\s*\{[^}]*max-height:\s*min\(240px,\s*calc\(var\(--available-height,\s*240px\)\s*-\s*10px\)\);[^}]*overflow:\s*auto;/s,
    );
    expect(button(host, "Show More")).toBeDefined();
    expect(button(host, "Show All")).toBeUndefined();
    expect(button(host, "Retry")).toBeDefined();

    await act(async () => button(host, "Task Details")?.focus());
    const tooltip = document.querySelector("[data-open]");
    expect(tooltip?.textContent).toContain("30 failed");
    expect(tooltip?.textContent).toContain("+25 more");
    expect(tooltip?.textContent).toContain(longTitle);
    expect(tooltip?.textContent).not.toContain("Visual post 5");
    expect(
      tooltip?.querySelector(`.${CSS.escape(styleClass(styles.breakdown))}`),
    ).toBeTruthy();

    await act(async () => button(host, "Show More")?.click());
    expect(host.textContent).toContain("Visual post 24");
    expect(host.textContent).not.toContain("Visual post 25");
    expect(button(host, "Show All")).toBeDefined();
    await act(async () => button(host, "Show All")?.click());
    expect(host.textContent).toContain("Visual post 29");
    expect(button(host, "Show Less")).toBeDefined();
    await act(async () => button(host, "Show Less")?.click());
    expect(host.textContent).not.toContain("Visual post 5");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("keeps the check unavailable until preferences load and processing is enabled", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    for (const loaded of [false, true]) {
      await act(async () => {
        root.render(
          <ProcessingStatusCard
            enabled={false}
            loaded={loaded}
            status={{
              inflight: 0,
              activeKeys: new Set(),
              failedKeys: new Set(),
            }}
            onCheck={async () => {}}
            onRepair={() => {}}
          />,
        );
      });
      expect(button(host, "Check Library")?.disabled).toBe(true);
      expect(host.textContent).toContain(
        loaded ? "Local processing is off" : "Loading processing settings",
      );
    }
  } finally {
    await act(async () => root.unmount());
  }
});
