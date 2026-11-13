import "./shadow.css";

import { initScrollFade } from "@pond/ui/scroll-fade";
import { createRoot } from "react-dom/client";
import { onOverlayMessage } from "@/utils/overlay-messaging";
import { Layer } from "./layer";
import { createOverlayStore } from "./store";

export default defineContentScript({
  registration: "runtime",
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",
  main(ctx) {
    const store = createOverlayStore();
    /** The background messages right after injecting, so listen before the shadow root mounts. */
    const stop = onOverlayMessage("show", ({ data }) => {
      store.show(data.request, data.appearance);
      return true;
    });
    ctx.onInvalidated(stop);

    /** Shadow roots ignore `@font-face`, so the face goes on the page's font set under a name pages won't use. */
    const inter = new FontFace(
      "pond-inter",
      `url(${browser.runtime.getURL("/fonts/inter/variable.woff2")})`,
      { weight: "100 900", display: "swap" },
    );
    document.fonts.add(inter);
    void inter.load().catch(() => undefined);
    ctx.onInvalidated(() => document.fonts.delete(inter));

    void createShadowRootUi(ctx, {
      name: "pond-overlay",
      position: "inline",
      anchor: "html",
      onMount(container) {
        initScrollFade(container);
        const root = createRoot(container);
        root.render(<Layer store={store} container={container} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    }).then((ui) => ui.mount());
  },
});
