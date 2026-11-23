import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Switch } from ".";

describe("Switch", () => {
  it("marks a disabled switch with the attribute on its span root", () => {
    const markup = renderToStaticMarkup(<Switch.Root checked disabled />);

    expect(markup).toMatch(/^<span [^>]*data-disabled=""/);
  });
});
