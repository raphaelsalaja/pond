/** Installs the DevTools hook before any test loads react-dom, so render counts see every commit. */
import { afterEach } from "vitest";
import { bridge } from "../src/renderer/src/shared/test/pond-bridge";
import { resetRenderRecorders } from "../src/renderer/src/shared/test/render-count";

afterEach(resetRenderRecorders);
afterEach(bridge.reset);
window.pond = bridge.api;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
/** Pond ships only on macOS; jsdom's user agent otherwise reads as Linux and remaps `Mod` to Ctrl. */
Object.defineProperty(navigator, "platform", {
  value: "MacIntel",
  configurable: true,
});
