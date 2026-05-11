/**
 * Parse `pond://pair?port=<port>&token=<token>` strings copied from the
 * Pond desktop tray. Kept lenient to survive mobile-keyboard quirks
 * (extra whitespace, accidental angle brackets from Mail.app).
 */
export function parsePairingLink(
  raw: string,
): { endpoint: string; token: string; port: number } | null {
  try {
    const cleaned = raw.trim().replace(/^[<"']|[>"']$/g, "");
    if (!cleaned.startsWith("pond://pair")) return null;
    const url = new URL(cleaned.replace(/^pond:\/\//, "http://"));
    const portRaw = url.searchParams.get("port") ?? "41610";
    const port = Number.parseInt(portRaw, 10) || 41610;
    const token = url.searchParams.get("token") ?? "";
    if (!token) return null;
    return {
      endpoint: `http://127.0.0.1:${port}/api/v2/item/add`,
      token,
      port,
    };
  } catch {
    return null;
  }
}
