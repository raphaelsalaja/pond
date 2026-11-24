import {
  useCallback,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { sendMessage } from "@/utils/messaging";
import type { OverlayResult } from "@/utils/messaging";
import { paintTheme } from "@/utils/paint-theme";
import { Details } from "../details";
import { ImagePicker } from "../images";
import { RegionPicker } from "../region";
import type { OverlayStore } from "../store";
import { Toasts } from "../toasts";
import styles from "./styles.module.css";

interface LayerProps {
  store: OverlayStore;
  container: HTMLElement;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export function Layer({ store, container }: LayerProps) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(listener),
    [store],
  );
  const { appearance, tool } = useSyncExternalStore(subscribe, store.getState);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(
    () => paintTheme(container, appearance),
    [container, appearance],
  );

  const finish = async (result: OverlayResult | null) => {
    store.closeTool();
    if (!result) {
      return;
    }
    /** Two frames let the picker unpaint before the background screenshots the tab. */
    await nextFrame();
    await nextFrame();
    await sendMessage("overlayResult", result).catch(() => {});
  };

  return (
    <div ref={setLayer} className={styles.layer}>
      {tool?.view === "region" && layer ? (
        <RegionPicker container={layer} onFinish={finish} />
      ) : null}
      {tool?.view === "images" && layer ? (
        <ImagePicker
          library={tool.library}
          container={layer}
          onFinish={finish}
        />
      ) : null}
      {tool?.view === "details" && layer ? (
        <Details
          key={tool.draft.url + tool.draft.title}
          draft={tool.draft}
          library={tool.library}
          container={layer}
          onFinish={finish}
        />
      ) : null}
      {layer ? <Toasts manager={store.toasts} container={layer} /> : null}
    </div>
  );
}
