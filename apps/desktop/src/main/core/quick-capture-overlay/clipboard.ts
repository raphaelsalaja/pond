/** Password managers mark copied secrets with these types so clipboard tools leave them alone. */
const PRIVATE_CLIPBOARD_TYPES = [
  "org.nspasteboard.ConcealedType",
  "org.nspasteboard.TransientType",
  "ExcludeClipboardContentFromMonitorProcessing",
  "x-kde-passwordManagerHint",
] as const;

const MAX_PREFILL = 100_000;

export interface ClipboardReader {
  has(mimetype: string): Promise<boolean>;
  readText(): Promise<string>;
}

/** Electron only reports raw platform types, such as macOS pasteboard UTIs, through this custom format. */
function rawClipboardFormat(type: string): string {
  return `electron application/osclipboard;format="${type}"`;
}

function privateFormats(type: string): Array<string> {
  return [type, rawClipboardFormat(type)];
}

export async function clipboardPrefill(
  reader: ClipboardReader,
): Promise<string> {
  const formats = PRIVATE_CLIPBOARD_TYPES.flatMap(privateFormats);
  const marked = await Promise.all(formats.map((format) => reader.has(format)));
  if (marked.includes(true)) return "";
  return (await reader.readText()).slice(0, MAX_PREFILL);
}
