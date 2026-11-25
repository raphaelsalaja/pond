export function srtToVtt(input: string): string {
  const normalized = input.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (normalized.startsWith("WEBVTT")) {
    return normalized;
  }
  const body = normalized.replaceAll(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${body.trim()}\n`;
}
