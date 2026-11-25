import type { ShortcutDef } from "../../shared/shortcuts";

const MENU_MODIFIERS = new Set([
  "Mod",
  "CommandOrControl",
  "CmdOrCtrl",
  "Command",
  "Cmd",
  "Control",
  "Ctrl",
  "Alt",
  "Option",
  "Meta",
  "Super",
]);

/** macOS still highlights displayed single-key accelerators even when registerAccelerator is false. */
export function isTypingMenuAccelerator(accelerator: string): boolean {
  if (accelerator.includes(" ")) return true;
  return !accelerator.split("+").some((part) => MENU_MODIFIERS.has(part));
}

export function menuAccelerator(shortcut: ShortcutDef): string | undefined {
  if (shortcut.sequence) return undefined;
  const accelerator = shortcut.keys
    ?.split("+")
    .map((part) => {
      switch (part) {
        case "Mod":
          return "CommandOrControl";
        case "Meta":
          return process.platform === "darwin" ? "Command" : "Super";
        case "ArrowLeft":
          return "Left";
        case "ArrowRight":
          return "Right";
        case "ArrowUp":
          return "Up";
        case "ArrowDown":
          return "Down";
        default:
          return part;
      }
    })
    .join("+");
  if (!accelerator || isTypingMenuAccelerator(accelerator)) return undefined;
  return accelerator;
}
