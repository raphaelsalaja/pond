import {
  resolveShortcuts,
  SHORTCUT_PLATFORM,
  type SHORTCUTS,
  type ShortcutBindings,
  type ShortcutDef,
  type ShortcutId,
  type ShortcutPreferences,
} from "@shared/shortcuts";
import {
  formatForDisplay,
  matchesKeyboardEvent,
  parseHotkey,
} from "@tanstack/react-hotkeys";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

export {
  isShortcutId,
  isValidShortcut,
  RATING_COMMANDS,
  resolveShortcuts,
  SHORTCUT_PLATFORM,
  SHORTCUTS,
  type ShortcutDef,
  type ShortcutId,
} from "@shared/shortcuts";

type ShortcutKeyId = {
  [Id in ShortcutId]: (typeof SHORTCUTS)[Id] extends {
    readonly keys: string;
  }
    ? Id
    : never;
}[ShortcutId];

type ShortcutSequenceId = {
  [Id in ShortcutId]: (typeof SHORTCUTS)[Id] extends {
    readonly sequence: readonly string[];
  }
    ? Id
    : never;
}[ShortcutId];

const shortcutPreferences = new Store<ShortcutPreferences>({
  profile: "pond",
  overrides: {},
});

export function configureShortcuts(preferences: ShortcutPreferences): void {
  shortcutPreferences.setState(() => preferences);
}

export function useShortcutBindings(): ShortcutBindings {
  const preferences = useSelector(shortcutPreferences, (value) => value);
  return resolveShortcuts(preferences);
}

export function bindingKeys(
  bindings: ShortcutBindings,
  id: ShortcutKeyId,
): NonNullable<ShortcutDef["keys"]> {
  const keys = bindings[id].keys;
  if (!keys) throw new Error(`Shortcut "${id}" has no key binding`);
  return keys;
}

export function matchesShortcut(
  event: KeyboardEvent,
  id: ShortcutKeyId,
): boolean {
  const keys = resolveShortcuts(shortcutPreferences.state)[id].keys;
  return (
    keys != null &&
    matchesKeyboardEvent(
      event,
      parseHotkey(keys, SHORTCUT_PLATFORM),
      SHORTCUT_PLATFORM,
    )
  );
}

export function bindingSequence(
  bindings: ShortcutBindings,
  id: ShortcutSequenceId,
): NonNullable<ShortcutDef["sequence"]> {
  const sequence = bindings[id].sequence;
  if (!sequence) throw new Error(`Shortcut "${id}" has no sequence binding`);
  return sequence;
}

export function shortcutConflict(
  id: ShortcutId,
  chord: string,
  preferences: ShortcutPreferences,
): string | null {
  const normalized = (keys: string) =>
    chordGlyphs(keys)
      .map((key) => key.toLowerCase())
      .sort()
      .join("+");
  for (const [otherId, definition] of Object.entries(
    resolveShortcuts(preferences),
  )) {
    if (
      otherId !== id &&
      definition.keys &&
      normalized(definition.keys) === normalized(chord)
    )
      return definition.label;
  }
  return null;
}

const MODIFIER_GLYPH = /[⌘⌃⌥⇧]/u;

/** Peel fused modifier glyphs. formatForDisplay may emit `⌘,` with no separator. */
function unfuseGlyphs(token: string): string[] {
  if (token.length <= 1) return [token];
  const parts: string[] = [];
  let i = 0;
  while (i < token.length) {
    const ch = token[i];
    if (ch === undefined) break;
    if (MODIFIER_GLYPH.test(ch) && i < token.length - 1) {
      parts.push(ch);
      i += 1;
      continue;
    }
    parts.push(token.slice(i));
    break;
  }
  return parts;
}

const MAC_GLYPH_WORDS = new Map([
  ["⌘", "Ctrl"],
  ["⌥", "Alt"],
  ["⇧", "Shift"],
]);

/** Editor shortcuts are authored with macOS glyphs; other platforms spell the modifiers out. */
export function platformGlyphs(
  glyphs: readonly string[],
  platform = SHORTCUT_PLATFORM,
): string[] {
  if (platform === "mac") return [...glyphs];
  return glyphs.map((glyph) => MAC_GLYPH_WORDS.get(glyph) ?? glyph);
}

export function chordGlyphs(keys: string): string[] {
  return formatForDisplay(keys, { platform: SHORTCUT_PLATFORM })
    .split(/[\s+]+/)
    .filter(Boolean)
    .flatMap(unfuseGlyphs);
}

function defOf(id: ShortcutId): ShortcutDef {
  return resolveShortcuts(shortcutPreferences.state)[id];
}

export function shortcutGlyphs(id: ShortcutId): string[] {
  const def = defOf(id);
  if (def.keys) return chordGlyphs(def.keys);
  if (def.sequence) {
    return def.sequence.flatMap((step) => chordGlyphs(step));
  }
  return [];
}

export function shortcutChord(id: ShortcutId): string | null {
  return defOf(id).keys ?? null;
}

export function shortcutSequence(id: ShortcutId): readonly string[] | null {
  return defOf(id).sequence ?? null;
}
