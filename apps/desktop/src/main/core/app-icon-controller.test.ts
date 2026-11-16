// Checks that icon switches follow the color and style, skip unchanged icons, and recover from a failed step.
import { describe, expect, it } from "vitest";
import type { AppIconStyle } from "../../shared/app-icons";
import {
  type AppIconPorts,
  createAppIconController,
} from "./app-icon-controller";
import { chooseAppIconSource } from "./app-icon-source";

function harness() {
  const dock: string[] = [];
  const errors: Error[] = [];
  const ports: AppIconPorts = {
    decide: (id: string, style: AppIconStyle | null) =>
      chooseAppIconSource({
        platform: "darwin",
        packaged: true,
        adaptiveBuiltin: true,
        isDefault: id === "aqua",
        style,
        lightImage: `${id}/default.png`,
        darkImage: `${id}/dark.png`,
      }),
    showImage(path) {
      dock.push(path);
    },
    showBuiltin() {
      dock.push("builtin");
    },
    onError(err) {
      errors.push(err);
    },
  };
  return { controller: createAppIconController(ports), dock, errors };
}

describe("app icon controller", () => {
  it("follows a color through every icon style", () => {
    const h = harness();
    h.controller.setStyle("light");
    h.controller.select("grape");
    h.controller.setStyle("dark");
    h.controller.setStyle("monochrome");
    h.controller.setStyle("light");
    expect(h.dock).toEqual([
      "grape/default.png",
      "grape/dark.png",
      "builtin",
      "grape/default.png",
    ]);
  });

  it("returns to the built-in icon when the default color is picked in Dark", () => {
    const h = harness();
    h.controller.setStyle("light");
    h.controller.select("grape");
    h.controller.setStyle("dark");
    h.controller.select("aqua");
    expect(h.dock.at(-1)).toBe("builtin");
  });

  it("skips work when nothing visible changes", () => {
    const h = harness();
    h.controller.select("aqua");
    h.controller.setStyle("dark");
    h.controller.setStyle("monochrome");
    expect(h.dock).toEqual(["builtin"]);
  });

  it("recovers on the next change after a failed step", () => {
    const h = harness();
    let fail = true;
    const ports: AppIconPorts = {
      decide: () => ({ kind: "image", path: "grape/default.png" }),
      showImage(path) {
        if (fail) throw new Error("dock unavailable");
        h.dock.push(path);
      },
      showBuiltin() {},
      onError(err) {
        h.errors.push(err);
      },
    };
    const controller = createAppIconController(ports);
    controller.select("grape");
    fail = false;
    controller.setStyle("light");
    expect(h.errors).toHaveLength(1);
    expect(h.dock).toEqual(["grape/default.png"]);
  });
});
