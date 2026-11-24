/** Installs the DevTools hook before any test loads react-dom, so render counts see every commit. */
import { afterEach } from "vitest";
import { cdp } from "vitest/browser";
import { bridge } from "../src/renderer/src/shared/test/pond-bridge";
import { resetRenderRecorders } from "../src/renderer/src/shared/test/render-count";

const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** Pond ships only on macOS; Chromium's own emulation keeps `Mod` as ⌘ and Finder copy on Linux and Windows runners. */
await cdp().send("Emulation.setUserAgentOverride", {
  userAgent: MAC_CHROME,
  platform: "MacIntel",
});

afterEach(resetRenderRecorders);
afterEach(bridge.reset);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.pond = bridge.api;
