import { app, BrowserWindow, session } from "electron";
import log from "electron-log/main.js";

const PROD_CSP = [
  "default-src 'self' pond:",
  "img-src 'self' data: blob: pond: https:",
  "media-src 'self' data: blob: pond: https:",
  "style-src 'self' 'unsafe-inline'",
  /** onnxruntime-web needs wasm-unsafe-eval and blob: for its wasm module/worker. */
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: http://127.0.0.1:* pond: https:",
  "font-src 'self' data: pond:",
  "frame-src pond: https://www.youtube-nocookie.com",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join("; ");

export function productionResponseHeaders(
  url: string,
  responseHeaders: Record<string, string[]> | undefined,
): Record<string, string[]> | undefined {
  /** pond:// serves the archive viewer and wabac's service worker; injecting the app CSP/COEP there breaks replay. The app document itself loads from file://, so its CSP is unaffected. */
  if (url.startsWith("pond://")) return responseHeaders;
  const headers = { ...responseHeaders };
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === "content-security-policy") {
      delete headers[key];
    }
  }
  headers["Content-Security-Policy"] = [PROD_CSP];
  /** file:// is never cross-origin isolated, and COEP there makes Chromium block the file:// inference worker, which this hook cannot give a COEP header. */
  if (url.startsWith("file://")) return headers;
  /** Cross-origin isolation lets onnxruntime-web use multi-threaded WASM; `credentialless` keeps remote media loading without requiring CORP on the third party. */
  headers["Cross-Origin-Opener-Policy"] = ["same-origin"];
  headers["Cross-Origin-Embedder-Policy"] = ["credentialless"];
  return headers;
}

/** Only Pond's own renderer may enter full screen; pond:// is excluded because it also replays archived pages. */
export function grantsPermission(input: {
  permission: string;
  isMainFrame: boolean;
  requestingUrl: string;
  rendererUrl: string | undefined;
}): boolean {
  const { requestingUrl, rendererUrl } = input;
  const fromRenderer =
    requestingUrl.startsWith("file://") ||
    (!!rendererUrl && requestingUrl.startsWith(rendererUrl));
  return input.permission === "fullscreen" && input.isMainFrame && fromRenderer;
}

export function configureSessionDefaults(): void {
  type PermissionHandler = Parameters<
    Electron.Session["setPermissionRequestHandler"]
  >[0];
  const denyAll: PermissionHandler = (_wc, _permission, callback) =>
    callback(false);
  const grantAppFullscreen: PermissionHandler = (
    wc,
    permission,
    callback,
    details,
  ) => {
    const window = BrowserWindow.fromWebContents(wc);
    const granted =
      window?.webContents === wc &&
      grantsPermission({
        permission,
        isMainFrame: "isMainFrame" in details && details.isMainFrame,
        requestingUrl: details.requestingUrl ?? "",
        rendererUrl: process.env.ELECTRON_RENDERER_URL,
      });
    callback(granted);
  };
  session.defaultSession.setPermissionRequestHandler(grantAppFullscreen);
  session.defaultSession.setPermissionCheckHandler(() => false);
  try {
    session
      .fromPartition("persist:pond-scrapers")
      .setPermissionRequestHandler(denyAll);
  } catch (err) {
    log.warn("[pond] scrapers session permission handler failed", err);
  }

  if (app.isPackaged) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: productionResponseHeaders(
          details.url,
          details.responseHeaders,
        ),
      });
    });
  }
}
