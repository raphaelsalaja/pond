import { describe, expect, it, vi } from "vitest";
import {
  GlobalShortcutController,
  summonShortcutTarget,
} from "./global-shortcuts";

function fixture() {
  const callbacks = new Map<string, () => void>();
  const blocked = new Set<string>();
  const actions = {
    "app.summon": vi.fn(),
    "app.file-ring": vi.fn(),
  };
  const controller = new GlobalShortcutController(
    {
      register(key, callback) {
        if (blocked.has(key) || callbacks.has(key)) return false;
        callbacks.set(key, callback);
        return true;
      },
      unregister(key) {
        callbacks.delete(key);
      },
    },
    actions,
    true,
  );
  controller.start({});
  return { controller, callbacks, blocked, actions };
}

describe("global shortcut registration", () => {
  it("registers Show Pond and the File To ring", () => {
    const { callbacks } = fixture();
    expect([...callbacks.keys()]).toEqual([
      "Command+Shift+L",
      "Command+Shift+K",
    ]);
  });
  it("opens the ring on its own binding and releases it when cleared", () => {
    const { controller, callbacks, actions } = fixture();
    callbacks.get("Command+Shift+K")?.();
    expect(actions["app.file-ring"]).toHaveBeenCalledOnce();
    expect(actions["app.summon"]).not.toHaveBeenCalled();
    controller.prepare({ "app.file-ring": "" }).commit();
    expect(callbacks.has("Command+Shift+K")).toBe(false);
    expect(callbacks.has("Command+Shift+L")).toBe(true);
  });
  it("keeps old dispatch until persisted and can roll back staged bindings", () => {
    const { controller, callbacks, actions } = fixture();
    const old = "Command+Shift+L";
    const change = controller.prepare({ "app.summon": "Meta+Shift+A" });
    callbacks.get("Command+Shift+A")?.();
    expect(actions["app.summon"]).not.toHaveBeenCalled();
    callbacks.get(old)?.();
    expect(actions["app.summon"]).toHaveBeenCalledOnce();
    change.rollback();
    expect(callbacks.has("Command+Shift+A")).toBe(false);
    expect(callbacks.has(old)).toBe(true);
  });
  it("commits new dispatch and releases the previous binding", () => {
    const { controller, callbacks, actions } = fixture();
    controller.prepare({ "app.summon": "Meta+Shift+A" }).commit();
    callbacks.get("Command+Shift+A")?.();
    expect(actions["app.summon"]).toHaveBeenCalledOnce();
    expect(callbacks.has("Command+Shift+L")).toBe(false);
  });
  it("rolls back a partial registration failure and reports OS conflicts", () => {
    const { controller, callbacks, blocked } = fixture();
    const previous = [...callbacks.keys()];
    blocked.add("Command+Shift+A");
    expect(() =>
      controller.prepare({
        "app.summon": "Meta+Shift+A",
      }),
    ).toThrow("not changed");
    expect([...callbacks.keys()]).toEqual(previous);
  });
  it("reports unavailable startup bindings without claiming they registered", () => {
    const controller = new GlobalShortcutController(
      { register: () => false, unregister() {} },
      {
        "app.summon": vi.fn(),
        "app.file-ring": vi.fn(),
      },
      true,
    );
    controller.start({});
    expect(controller.status().errors).toHaveLength(2);
  });
  it("allows changing a binding that failed at startup", () => {
    const callbacks = new Map<string, () => void>();
    const controller = new GlobalShortcutController(
      {
        register(key, callback) {
          if (key.endsWith("+L")) return false;
          callbacks.set(key, callback);
          return true;
        },
        unregister(key) {
          callbacks.delete(key);
        },
      },
      {
        "app.summon": vi.fn(),
        "app.file-ring": vi.fn(),
      },
      true,
    );
    controller.start({});
    expect(controller.status().errors).toHaveLength(1);
    expect(controller.status().errors[0]).toContain("Show Pond");
    controller.prepare({ "app.summon": "Mod+Shift+A" }).commit();
    expect(callbacks.has("Command+Shift+A")).toBe(true);
    expect(controller.status().errors).toHaveLength(0);
  });
  it("reports invalid restored global preferences without interrupting app startup", () => {
    const { controller } = fixture();
    expect(() =>
      controller.start({ "app.summon": "Unrecognized" }),
    ).not.toThrow();
    expect(controller.status().errors[0]).toContain("modifier");
  });
});

describe("summon shortcut context", () => {
  it("routes the shared default through the renderer in the focused main window", () => {
    expect(summonShortcutTarget({}, true, true)).toBe("renderer");
    expect(summonShortcutTarget({}, false, true)).toBe("summon");
    expect(summonShortcutTarget({}, true, false)).toBe("renderer");
  });
  it("compares actual native accelerator aliases and preserves different overrides", () => {
    expect(
      summonShortcutTarget({ "view.layout-cycle": "Shift+Meta+L" }, true, true),
    ).toBe("renderer");
    expect(
      summonShortcutTarget(
        { "view.layout-cycle": "Shift+Control+L" },
        true,
        true,
      ),
    ).toBe("summon");
    expect(
      summonShortcutTarget({ "view.layout-cycle": "Mod+Shift+J" }, true, true),
    ).toBe("summon");
    expect(
      summonShortcutTarget({ "app.summon": "Mod+Shift+J" }, true, true),
    ).toBe("summon");
    expect(
      summonShortcutTarget(
        { "app.summon": "Mod+Shift+J", "view.layout-cycle": "Meta+Shift+J" },
        true,
        true,
      ),
    ).toBe("renderer");
  });
});
