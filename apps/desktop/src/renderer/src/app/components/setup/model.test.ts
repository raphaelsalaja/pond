import { DEFAULT_PREFS, PrefsSchema } from "@pond/schema/db";
import { describe, expect, it } from "vitest";
import { choicesFrom, parentFolder } from "./model";

const library = {
  name: "My Pond",
  path: "/Users/ada/Pond/My Pond.pond",
  parent: "/Users/ada/Pond",
  saves: 0,
};

describe("choicesFrom", () => {
  it("starts an existing install from its current preferences", () => {
    const prefs = PrefsSchema.parse({
      ai: { semanticSearch: false, enableOcr: false, enableClip: true },
      preferences: { appearance: "dark", soundsEnabled: false },
      quickCapture: { launchAtLogin: true },
    });
    const choices = choicesFrom(prefs, library, "existing");
    expect(choices.options).toMatchObject({
      semanticSearch: false,
      enableOcr: false,
      enableClip: true,
      soundsEnabled: false,
      launchAtLogin: true,
    });
    expect(choices.appearance).toBe("dark");
    expect(choices.assistant).toBe("later");
    expect(choices.libraryLocation).toBe(library.parent);
  });

  it("recommends search and text recognition for a new library", () => {
    const choices = choicesFrom(DEFAULT_PREFS, library, "new");
    expect(choices.options.semanticSearch).toBe(true);
    expect(choices.options.enableOcr).toBe(true);
    expect(choices.options.enableCaption).toBe(false);
    expect(choices.libraryName).toBe("My Pond");
  });
});

describe("parentFolder", () => {
  it("finds the folder holding a library on macOS and Windows", () => {
    expect(parentFolder("/Users/ada/Pond/My Pond.pond")).toBe(
      "/Users/ada/Pond",
    );
    expect(parentFolder("C:\\Users\\ada\\Pond\\My Pond.pond")).toBe(
      "C:\\Users\\ada\\Pond",
    );
  });
});
