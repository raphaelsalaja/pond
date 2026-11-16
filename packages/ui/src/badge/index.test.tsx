import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge } from ".";

describe("Badge", () => {
  it("renders semantic status tones", () => {
    const inverted = renderToStaticMarkup(
      <Badge tone="inverted">Downloading</Badge>,
    );
    const negative = renderToStaticMarkup(
      <Badge tone="negative">Failed</Badge>,
    );

    expect(inverted).toContain('data-tone="inverted"');
    expect(negative).toContain('data-tone="negative"');
  });

  it("renders a semantic status dot", () => {
    const markup = renderToStaticMarkup(<Badge.Dot tone="accent" />);

    expect(markup).toContain('data-tone="accent"');
    expect(markup).toContain('aria-hidden="true"');
  });
});
