import { describe, expect, it } from "vitest";
import {
  areaCenter,
  OVERLAY_SIZE,
  overlayBehavior,
  overlayBounds,
} from "./placement";

const PRIMARY = { x: 0, y: 25, width: 1440, height: 875 };
const LEFT = { x: -1920, y: -200, width: 1920, height: 1080 };

describe("overlay placement", () => {
  it("centers the ring on the pointer", () => {
    expect(overlayBounds({ x: 700, y: 400 }, [PRIMARY])).toEqual({
      x: 700 - OVERLAY_SIZE / 2,
      y: 400 - OVERLAY_SIZE / 2,
      width: OVERLAY_SIZE,
      height: OVERLAY_SIZE,
    });
  });

  it("slides inward at every screen edge", () => {
    expect(overlayBounds({ x: 4, y: 30 }, [PRIMARY])).toMatchObject({
      x: 0,
      y: 25,
    });
    expect(overlayBounds({ x: 1439, y: 899 }, [PRIMARY])).toMatchObject({
      x: 1440 - OVERLAY_SIZE,
      y: 900 - OVERLAY_SIZE,
    });
  });

  it("opens on the display under the pointer, including ones left of the primary", () => {
    expect(overlayBounds({ x: -100, y: -150 }, [PRIMARY, LEFT])).toEqual({
      x: -OVERLAY_SIZE,
      y: -200,
      width: OVERLAY_SIZE,
      height: OVERLAY_SIZE,
    });
  });

  it("uses the nearest work area when the pointer sits on the menu bar or a gap", () => {
    expect(overlayBounds({ x: 720, y: 5 }, [LEFT, PRIMARY])).toMatchObject({
      x: 720 - OVERLAY_SIZE / 2,
      y: 25,
    });
  });

  it("shrinks to a display smaller than the ring", () => {
    const tiny = { x: 0, y: 0, width: 300, height: 200 };
    expect(overlayBounds({ x: 150, y: 100 }, [tiny])).toEqual(tiny);
  });

  it("returns nothing without a display", () => {
    expect(overlayBounds({ x: 0, y: 0 }, [])).toBeNull();
  });

  it("finds the center of a work area for platforms without a pointer", () => {
    expect(areaCenter(PRIMARY)).toEqual({ x: 720, y: 462.5 });
  });
});

describe("overlay behavior by platform", () => {
  it("uses a non-activating panel on every macOS workspace", () => {
    expect(overlayBehavior("darwin", undefined)).toEqual({
      panel: true,
      allWorkspaces: true,
      atPointer: true,
    });
  });

  it("takes focus on Windows and stays on the current desktop", () => {
    expect(overlayBehavior("win32", undefined)).toEqual({
      panel: false,
      allWorkspaces: false,
      atPointer: true,
    });
  });

  it("follows the pointer on X11 but not on Wayland", () => {
    expect(overlayBehavior("linux", "x11").atPointer).toBe(true);
    expect(overlayBehavior("linux", "wayland")).toEqual({
      panel: false,
      allWorkspaces: true,
      atPointer: false,
    });
  });
});
