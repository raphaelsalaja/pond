import type { CanvasSide } from "@shared/canvas-contracts";
import { type AlignEdge, type Axis, GRID, type LayerMove } from "./document";

export type CanvasCommand =
  | { type: "select-all" }
  | { type: "copy" }
  | { type: "cut" }
  | { type: "duplicate" }
  | { type: "delete" }
  | { type: "layer"; move: LayerMove }
  | { type: "align"; edge: AlignEdge }
  | { type: "distribute"; axis: Axis }
  | { type: "tidy" }
  | { type: "lock" }
  | { type: "group" }
  | { type: "ungroup" }
  | { type: "wrap" }
  | {
      type: "export";
      format: "png" | "pdf";
      /** Without a scope, export takes the selection, or the whole board when nothing is selected. */
      scope?: "board" | "selection";
    }
  | { type: "zoom"; to: "fit" | "actual" | "selection" }
  | { type: "minimap" }
  | { type: "nudge"; x: number; y: number }
  | { type: "rotate"; delta: number }
  | { type: "flip"; axis: "horizontal" | "vertical" }
  | { type: "convert-notes" }
  | { type: "sort-notes" }
  | { type: "crop" }
  | { type: "reset-crop" }
  | { type: "quick"; side: CanvasSide };

export type KeyChord = Pick<
  KeyboardEvent,
  "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

interface Chord {
  mod?: true;
  control?: true;
  alt?: true;
  shift?: true;
  code: string;
  glyph: string;
}

/** Codes, not keys: ⌥ rewrites `event.key` on a Mac keyboard. */
const BINDINGS: ReadonlyArray<readonly [Chord, CanvasCommand]> = [
  [{ mod: true, code: "KeyA", glyph: "A" }, { type: "select-all" }],
  [{ mod: true, code: "KeyC", glyph: "C" }, { type: "copy" }],
  [{ mod: true, code: "KeyX", glyph: "X" }, { type: "cut" }],
  [{ mod: true, code: "KeyD", glyph: "D" }, { type: "duplicate" }],
  [
    { mod: true, alt: true, code: "BracketRight", glyph: "]" },
    { type: "layer", move: "front" },
  ],
  [
    { mod: true, alt: true, code: "BracketLeft", glyph: "[" },
    { type: "layer", move: "back" },
  ],
  [
    { alt: true, code: "KeyA", glyph: "A" },
    { type: "align", edge: "left" },
  ],
  [
    { alt: true, code: "KeyH", glyph: "H" },
    { type: "align", edge: "center" },
  ],
  [
    { alt: true, code: "KeyD", glyph: "D" },
    { type: "align", edge: "right" },
  ],
  [
    { alt: true, code: "KeyW", glyph: "W" },
    { type: "align", edge: "top" },
  ],
  [
    { alt: true, code: "KeyV", glyph: "V" },
    { type: "align", edge: "middle" },
  ],
  [
    { alt: true, code: "KeyS", glyph: "S" },
    { type: "align", edge: "bottom" },
  ],
  [
    { control: true, alt: true, code: "KeyH", glyph: "H" },
    { type: "distribute", axis: "horizontal" },
  ],
  [
    { control: true, alt: true, code: "KeyV", glyph: "V" },
    { type: "distribute", axis: "vertical" },
  ],
  [{ control: true, alt: true, code: "KeyT", glyph: "T" }, { type: "tidy" }],
  [{ mod: true, shift: true, code: "KeyL", glyph: "L" }, { type: "lock" }],
  [{ mod: true, code: "KeyG", glyph: "G" }, { type: "group" }],
  [{ mod: true, shift: true, code: "KeyG", glyph: "G" }, { type: "ungroup" }],
  [
    { mod: true, shift: true, code: "KeyE", glyph: "E" },
    { type: "export", format: "png" },
  ],
  [
    { alt: true, code: "KeyR", glyph: "R" },
    { type: "rotate", delta: 15 },
  ],
  [
    { alt: true, shift: true, code: "KeyR", glyph: "R" },
    { type: "rotate", delta: -15 },
  ],
  [
    { alt: true, code: "ArrowUp", glyph: "↑" },
    { type: "quick", side: "top" },
  ],
  [
    { alt: true, code: "ArrowRight", glyph: "→" },
    { type: "quick", side: "right" },
  ],
  [
    { alt: true, code: "ArrowDown", glyph: "↓" },
    { type: "quick", side: "bottom" },
  ],
  [
    { alt: true, code: "ArrowLeft", glyph: "←" },
    { type: "quick", side: "left" },
  ],
  [
    { shift: true, code: "Digit1", glyph: "1" },
    { type: "zoom", to: "fit" },
  ],
  [
    { shift: true, code: "Digit0", glyph: "0" },
    { type: "zoom", to: "actual" },
  ],
  [
    { shift: true, code: "Digit2", glyph: "2" },
    { type: "zoom", to: "selection" },
  ],
];

const ARROWS = new Map<string, readonly [x: number, y: number]>([
  ["ArrowUp", [0, -1]],
  ["ArrowDown", [0, 1]],
  ["ArrowLeft", [-1, 0]],
  ["ArrowRight", [1, 0]],
]);

function matches(chord: Chord, event: KeyChord): boolean {
  const mod = event.metaKey || (event.ctrlKey && !chord.control);
  const control = event.ctrlKey && !event.metaKey && Boolean(chord.control);
  return (
    event.code === chord.code &&
    mod === Boolean(chord.mod) &&
    control === Boolean(chord.control) &&
    event.altKey === Boolean(chord.alt) &&
    event.shiftKey === Boolean(chord.shift)
  );
}

export function commandForKey(event: KeyChord): CanvasCommand | null {
  const arrow = ARROWS.get(event.key);
  if (arrow && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const step = event.shiftKey ? GRID : 1;
    return { type: "nudge", x: arrow[0] * step, y: arrow[1] * step };
  }
  const binding = BINDINGS.find(([chord]) => matches(chord, event));
  return binding ? binding[1] : null;
}

/** Mac glyphs in the platform's modifier order; menus pass them through `platformGlyphs`. */
export function glyphsFor(command: CanvasCommand): string[] | undefined {
  const key = JSON.stringify(command);
  const binding = BINDINGS.find(
    ([, candidate]) => JSON.stringify(candidate) === key,
  );
  if (!binding) return undefined;
  const [chord] = binding;
  return [
    ...(chord.control ? ["⌃"] : []),
    ...(chord.alt ? ["⌥"] : []),
    ...(chord.shift ? ["⇧"] : []),
    ...(chord.mod ? ["⌘"] : []),
    chord.glyph,
  ];
}
