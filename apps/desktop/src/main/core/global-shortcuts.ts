import {
  defaultGlobalKeys,
  GLOBAL_SHORTCUTS,
  type GlobalShortcutId,
  type GlobalShortcutStatus,
  LAYOUT_CYCLE_SHORTCUT,
} from "../../shared/global-shortcuts";

interface NativeShortcuts {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}
interface Change {
  commit(): void;
  rollback(): void;
}
type Bindings = Readonly<Record<string, string>>;
type Actions = Record<GlobalShortcutId, () => void>;
const ids = Object.keys(GLOBAL_SHORTCUTS).filter(
  (id): id is GlobalShortcutId => id in GLOBAL_SHORTCUTS,
);

function accelerator(chord: string, isMac: boolean): string {
  const parts = chord.split("+");
  const key = parts.pop() ?? "";
  const modifiers = new Set<string>();
  for (const part of parts) {
    switch (part.toLowerCase()) {
      case "mod":
        modifiers.add(isMac ? "Command" : "Control");
        break;
      case "meta":
      case "command":
      case "cmd":
        modifiers.add(isMac ? "Command" : "Super");
        break;
      case "control":
      case "ctrl":
        modifiers.add("Control");
        break;
      case "alt":
      case "option":
        modifiers.add("Alt");
        break;
      case "shift":
        modifiers.add("Shift");
        break;
      default:
        throw new Error("Choose a supported global key combination.");
    }
  }
  if (
    !modifiers.size ||
    !/^(?:[a-z0-9,./;[\]'\\`=-]|F(?:[1-9]|1\d|2[0-4])|Space|Enter|Escape|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Arrow(?:Up|Down|Left|Right))$/i.test(
      key,
    )
  )
    throw new Error("Global shortcuts need a modifier and a supported key.");
  return [...modifiers]
    .sort()
    .concat(key.replace(/^Arrow/, "").toUpperCase())
    .join("+");
}

export function summonShortcutTarget(
  overrides: Bindings,
  mainWindowFocused: boolean,
  isMac: boolean,
): "renderer" | "summon" {
  if (!mainWindowFocused) return "summon";
  try {
    const summon = accelerator(
      overrides["app.summon"] ?? GLOBAL_SHORTCUTS["app.summon"].keys,
      isMac,
    );
    const layout = accelerator(
      overrides["view.layout-cycle"] ?? LAYOUT_CYCLE_SHORTCUT.keys,
      isMac,
    );
    return summon === layout ? "renderer" : "summon";
  } catch {
    return "summon";
  }
}

export class GlobalShortcutController {
  private active = new Map<string, GlobalShortcutId>();
  private configured = new Map<string, GlobalShortcutId>();
  private errors: string[] = [];
  constructor(
    private readonly native: NativeShortcuts,
    private readonly actions: Actions,
    private readonly isMac: boolean,
  ) {}

  private desired(overrides: Bindings): Map<string, GlobalShortcutId> {
    const desired = new Map<string, GlobalShortcutId>();
    for (const id of ids) {
      const chord = overrides[id] ?? defaultGlobalKeys(id);
      if (!chord) continue;
      const key = accelerator(chord, this.isMac);
      const conflict = desired.get(key);
      if (conflict)
        throw new Error(
          `${GLOBAL_SHORTCUTS[id].label} shares a shortcut with ${GLOBAL_SHORTCUTS[conflict].label}. Choose another shortcut.`,
        );
      desired.set(key, id);
    }
    return desired;
  }

  start(overrides: Bindings): void {
    let desired: Map<string, GlobalShortcutId>;
    try {
      desired = this.desired(overrides);
    } catch (error) {
      this.errors = [
        error instanceof Error
          ? error.message
          : "Couldn't register global shortcuts.",
      ];
      return;
    }
    this.configured = desired;
    this.errors = [];
    for (const [key, id] of desired) {
      try {
        if (!this.native.register(key, () => this.dispatch(key)))
          throw new Error("Unavailable");
        this.active.set(key, id);
      } catch {
        this.errors.push(
          `${GLOBAL_SHORTCUTS[id].label} (${key}) is unavailable. Choose another shortcut.`,
        );
      }
    }
  }

  status(): GlobalShortcutStatus {
    return { enabled: true, errors: [...this.errors] };
  }

  private dispatch(key: string): void {
    const id = this.active.get(key);
    if (id) this.actions[id]();
  }

  prepare(overrides: Bindings): Change {
    const desired = this.desired(overrides);
    const staged: string[] = [];
    const rollback = () => {
      for (const key of staged) this.native.unregister(key);
    };
    for (const [key, id] of desired) {
      if (this.active.has(key) || this.configured.get(key) === id) continue;
      try {
        if (!this.native.register(key, () => this.dispatch(key)))
          throw new Error("Unavailable");
        staged.push(key);
      } catch {
        rollback();
        throw new Error(
          `${GLOBAL_SHORTCUTS[id].label} (${key}) is unavailable. Your shortcuts were not changed.`,
        );
      }
    }
    return {
      rollback,
      commit: () => {
        const previous = this.active;
        this.active = new Map(
          [...desired].filter(
            ([key]) => previous.has(key) || staged.includes(key),
          ),
        );
        this.configured = desired;
        this.errors = [...desired]
          .filter(([key]) => !this.active.has(key))
          .map(
            ([key, id]) =>
              `${GLOBAL_SHORTCUTS[id].label} (${key}) is unavailable. Choose another shortcut.`,
          );
        for (const key of previous.keys())
          if (!desired.has(key)) this.native.unregister(key);
      },
    };
  }
}

let controller: GlobalShortcutController | undefined;
export function startGlobalShortcuts(
  native: NativeShortcuts,
  actions: Actions,
  overrides: Bindings,
): void {
  controller = new GlobalShortcutController(
    native,
    actions,
    process.platform === "darwin",
  );
  controller.start(overrides);
}
export function globalShortcutStatus(): GlobalShortcutStatus {
  return controller?.status() ?? { enabled: false, errors: [] };
}
export function prepareGlobalShortcuts(overrides: Bindings): Change {
  return (
    controller?.prepare(overrides) ?? {
      commit() {},
      rollback() {},
    }
  );
}
