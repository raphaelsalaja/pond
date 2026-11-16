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

    /** Shadow roots ignore `@font-face`, so the faces go on the page's font set under names pages won't use. */
    const faces = [
      ["pond-intern", "/fonts/intern/variable.woff2"],
      ["pond-inter", "/fonts/inter/variable.woff2"],
    ] as const;
    for (const [family, path] of faces) {
      const face = new FontFace(
        family,
        `url(${browser.runtime.getURL(path)})`,
        { weight: "100 900", display: "swap" },
      );
      document.fonts.add(face);
      void face.load().catch(() => undefined);
      ctx.onInvalidated(() => document.fonts.delete(face));
    }

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
