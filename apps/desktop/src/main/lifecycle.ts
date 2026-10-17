/** Pure decisions for app start and shutdown, kept separate so they can be tested per platform. */

/**
 * Whether Pond keeps running after its last window closes. macOS always does;
 * Windows only when the user asked to keep running in the tray, because the
 * default close would otherwise strand a hidden process.
 */
export function shouldStayResident(input: {
  platform: NodeJS.Platform;
  closeToTray: boolean;
  hasTray: boolean;
}): boolean {
  if (input.platform === "darwin") return true;
  if (input.platform === "win32") return input.closeToTray && input.hasTray;
  return input.hasTray;
}

/** A development Electron must not take over `pond://` from an installed Pond on Windows. */
export function protocolRegistration(input: {
  platform: NodeJS.Platform;
  hasInstanceLock: boolean;
  sandboxed: boolean;
  defaultApp: boolean;
}): "none" | "development" | "packaged" {
  if (input.sandboxed) return "none";
  if (input.platform === "win32") {
    if (!input.hasInstanceLock || input.defaultApp) return "none";
    return "packaged";
  }
  return input.defaultApp ? "development" : "packaged";
}

/**
 * A hidden Windows start with no notification-area icon would leave nothing to
 * click, so the window opens instead.
 */
export function resolveLaunchHidden(input: {
  platform: NodeJS.Platform;
  requested: boolean;
  trayEnabled: boolean;
}): boolean {
  if (input.platform === "win32") return input.requested && input.trayEnabled;
  return input.requested;
}

/**
 * The MCP server speaks JSON-RPC on stdout, so nothing else may write there.
 * The log console transport prints to stdout and must be off from the first
 * log line, not only once the server starts.
 */
export function consoleLoggingEnabled(argv: readonly string[]): boolean {
  return !argv.includes("--mcp");
}
