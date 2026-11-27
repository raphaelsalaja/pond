import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { server } from "vitest/browser";
import { expectAccessible } from "../test/axe";
import { COMPONENT_DOCS } from "./docs";

const THEMES = ["light", "dark"] as const;

/** Font rendering differs per OS; baselines are recorded on Linux CI only. */
const VISUAL = server.platform === "linux";

function screenshotName(...parts: ReadonlyArray<string>): string {
  return parts
    .join("-")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-");
}

/**
 * The pointer stays wherever an earlier test file left it, and Chromium applies
 * hover to whatever renders under it a frame later, so axe and screenshots could
 * read a hover state. Parking it on the frame's padding checks the resting state.
 */
async function renderExample(
  content: ReactNode,
  theme: (typeof THEMES)[number],
) {
  document.documentElement.dataset.theme = theme;
  const screen = await render(
    <div
      data-testid="example"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        padding: 16,
        color: "var(--ds-foreground-primary)",
        background: "var(--ds-background-primary)",
      }}
    >
      {content}
    </div>,
  );
  await screen.getByTestId("example").hover({ position: { x: 0, y: 0 } });
  return screen;
}

describe.each(COMPONENT_DOCS)("$name", (docs) => {
  it("documents at least one example", () => {
    expect(docs.examples.length).toBeGreaterThan(0);
  });

  describe.each(THEMES)("%s", (theme) => {
    it.each(docs.examples)("$name", async (example) => {
      await renderExample(example.render(), theme);
      await expectAccessible();
    });

    describe.skipIf(!VISUAL)("screenshot", () => {
      it.each(docs.examples)("$name", async (example) => {
        const screen = await renderExample(example.render(), theme);
        await expect
          .element(screen.getByTestId("example"))
          .toMatchScreenshot(screenshotName(docs.slug, example.name, theme));
      });
    });
  });
});
