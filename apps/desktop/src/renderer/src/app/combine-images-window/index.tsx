import { Tooltip } from "@pond/ui";
import type {
  CombineImagesWindowLoad,
  CombineImagesZoomAction,
} from "@shared/combine-images-contracts";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { MotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import { CombineImages } from "@/features/saves/components/combine-images";
import { ThemeApplier } from "@/features/settings/effects/theme-applier";
import { ToastHost } from "@/shared/components/toast-host";
import type { PondCombineApi } from "../../../../preload/combine-images";

declare global {
  interface Window {
    pondCombine?: PondCombineApi;
  }
}

function close(): void {
  void window.pondCombine?.close();
}

function resolveDrop(files: ReadonlyArray<File>): Promise<Array<string>> {
  return window.pondCombine?.resolveDrop(files) ?? Promise.resolve([]);
}

function subscribeZoom(
  callback: (action: CombineImagesZoomAction) => void,
): () => void {
  return window.pondCombine?.onZoom(callback) ?? (() => {});
}

export function CombineImagesWindow() {
  const [load, setLoad] = useState<CombineImagesWindowLoad | null>(null);
  useEffect(() => {
    const api = window.pondCombine;
    if (!api) return;
    let active = true;
    const apply = (next: CombineImagesWindowLoad) => {
      if (active) {
        setLoad((current) =>
          current && current.nonce >= next.nonce ? current : next,
        );
      }
    };
    const stop = api.onLoad(apply);
    void api.ready().then(apply);
    return () => {
      active = false;
      stop();
    };
  }, []);
  return (
    <MotionConfig reducedMotion="user">
      <HotkeysProvider>
        <Tooltip.Provider>
          <ThemeApplier />
          <CombineImages
            key={load?.nonce ?? 0}
            ids={load?.ids ?? []}
            folderId={load?.folderId ?? null}
            onClose={close}
            onResolveDrop={resolveDrop}
            subscribeZoom={subscribeZoom}
          />
          <ToastHost />
        </Tooltip.Provider>
      </HotkeysProvider>
    </MotionConfig>
  );
}
