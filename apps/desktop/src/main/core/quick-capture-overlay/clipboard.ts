/** Password managers mark copied secrets with these types so clipboard tools leave them alone. */
const PRIVATE_CLIPBOARD_TYPES = [
  "org.nspasteboard.ConcealedType",
  "org.nspasteboard.TransientType",
  "ExcludeClipboardContentFromMonitorProcessing",
  "x-kde-passwordManagerHint",
] as const;

const MAX_PREFILL = 100_000;

export interface ClipboardReader {
  /** Matches raw platform types such as macOS pasteboard UTIs. */
  has(format: string): boolean;
  availableFormats(): string[];
  readText(): string;
}

export function clipboardPrefill(reader: ClipboardReader): string {
  const formats = new Set(reader.availableFormats());
  const hidden = PRIVATE_CLIPBOARD_TYPES.some(
    (type) => formats.has(type) || reader.has(type),
  );
  return hidden ? "" : reader.readText().slice(0, MAX_PREFILL);
}
