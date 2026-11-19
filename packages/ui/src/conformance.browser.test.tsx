import { describe, expect, it } from "vitest";
import { server } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectAccessible } from "../test/axe";
import { COMPONENT_DOCS } from "./docs";

const THEMES = ["light", "dark"] as const;

/** Font rendering differs per OS; baselines are recorded on Linux CI only. */
const VISUAL = server.platform === "linux";

function screenshotName(...parts: readonly string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

describe.each(COMPONENT_DOCS)("$name", (docs) => {
  it("documents at least one example", () => {
    expect(docs.examples.length).toBeGreaterThan(0);
  });

  describe.each(THEMES)("%s", (theme) => {
    it.each(docs.examples)("$name", async (example) => {
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
          {example.render()}
        </div>,
      );

      await expectAccessible();

      if (VISUAL) {
        const frame = screen.getByTestId("example");
        /** The pointer stays wherever an earlier test file left it, which can paint a hover state into the shot. */
        await frame.hover({ position: { x: 0, y: 0 } });
        await expect
          .element(frame)
          .toMatchScreenshot(screenshotName(docs.slug, example.name, theme));
      }
    });
  });
});
