import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHiddenLibraryRelease,
  HIDDEN_LIBRARY_GRACE_MS,
} from "./hidden-library-release";

function fakeWindow() {
  return {
    destroyed: false,
    visible: false,
    focused: false,
    isDestroyed() {
      return this.destroyed;
    },
    isVisible() {
      return this.visible;
    },
    isFocused() {
      return this.focused;
    },
  };
}

type FakeWindow = ReturnType<typeof fakeWindow>;

function setup(options: { canRelease?: () => boolean } = {}) {
  const library = fakeWindow();
  const released: FakeWindow[] = [];
  const release = createHiddenLibraryRelease<FakeWindow>({
    isLibraryWindow: (win) => win === library,
    canRelease: options.canRelease ?? (() => true),
    release: (win) => {
      win.destroyed = true;
      released.push(win);
    },
  });
  return { library, released, release };
}

describe("createHiddenLibraryRelease", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("releases the hidden Library window once the grace period ends", () => {
    const { library, released, release } = setup();
    release.hidden(library);
    vi.advanceTimersByTime(HIDDEN_LIBRARY_GRACE_MS - 1);
    expect(released).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(released).toEqual([library]);
  });

  it("keeps the renderer when the window is shown again first", () => {
    const { library, released, release } = setup();
    release.hidden(library);
    vi.advanceTimersByTime(HIDDEN_LIBRARY_GRACE_MS / 2);
    library.visible = true;
    release.shown(library);
    library.visible = false;
    vi.advanceTimersByTime(HIDDEN_LIBRARY_GRACE_MS * 2);
    expect(released).toEqual([]);
  });

  it("restarts the grace period on each hide", () => {
    const { library, released, release } = setup();
    release.hidden(library);
    vi.advanceTimersByTime(HIDDEN_LIBRARY_GRACE_MS - 1);
    release.hidden(library);
    vi.advanceTimersByTime(HIDDEN_LIBRARY_GRACE_MS - 1);
    expect(released).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(released).toEqual([library]);
  });

  it("never releases once Pond starts quitting", () => {
    const { library, released, release } = setup();
    release.hidden(library);
    release.stop();
    vi.advanceTimersByTime(HIDDEN_LIBRARY_GRACE_MS * 2);
    release.hidden(library);
    vi.advanceTimersByTime(HIDDEN_LIBRARY_GRACE_MS * 2);
    expect(released).toEqual([]);
  });

  it("ignores windows other than the Library", () => {
    const { released, release } = setup();
    const preview = fakeWindow();
    release.hidden(preview);
    vi.advanceTimersByTime(HIDDEN_LIBRARY_GRACE_MS * 2);
    expect(released).toEqual([]);
    expect(preview.destroyed).toBe(false);
  });

  it("leaves a window that is visible, focused, or already gone", () => {
    for (const state of ["visible", "focused", "destroyed"] as const) {
      const { library, released, release } = setup();
      release.hidden(library);
      library[state] = true;
      vi.advanceTimersByTime(HIDDEN_LIBRARY_GRACE_MS);
      expect(released).toEqual([]);
    }
  });

  it("waits another grace period while the renderer is still needed", () => {
    let allowed = false;
    const { library, released, release } = setup({
      canRelease: () => allowed,
    });
    release.hidden(library);
    vi.advanceTimersByTime(HIDDEN_LIBRARY_GRACE_MS);
    expect(released).toEqual([]);
    allowed = true;
    vi.advanceTimersByTime(HIDDEN_LIBRARY_GRACE_MS);
    expect(released).toEqual([library]);
  });
});
