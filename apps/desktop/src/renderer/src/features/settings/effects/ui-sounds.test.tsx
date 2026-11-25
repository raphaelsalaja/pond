import { describe, expect, it } from "vitest";
import { toggleTurnsOn } from "./ui-sounds";

function element(html: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html;
  const child = host.firstElementChild;
  if (!child) throw new Error("Fixture must produce an element");
  return child;
}

describe("toggleTurnsOn", () => {
  it("reads the state a switch is leaving, not the one it shows", () => {
    expect(
      toggleTurnsOn(element('<span role="switch" aria-checked="false">')),
    ).toBe(true);
    expect(
      toggleTurnsOn(element('<span role="switch" aria-checked="true">')),
    ).toBe(false);
  });

  it("reads the state a pressed button is leaving", () => {
    expect(toggleTurnsOn(element('<button aria-pressed="false">'))).toBe(true);
    expect(toggleTurnsOn(element('<button aria-pressed="true">'))).toBe(false);
  });

  it("trusts a checkbox, which the browser flips before the click", () => {
    const off = element('<input type="checkbox">');
    const on = element('<input type="checkbox" checked>');

    expect(toggleTurnsOn(off)).toBe(false);
    expect(toggleTurnsOn(on)).toBe(true);
  });
});
