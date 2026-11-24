type ZoomPrefs = { window: { interfaceZoom: number } };

/** Page zoom keeps pointer and layout coordinates in one space; root CSS `zoom` misplaces slider thumbs and popovers. */
export function followInterfaceZoom(
  contents: {
    isDestroyed(): boolean;
    setZoomFactor(factor: number): void;
    on(event: "did-finish-load", listener: () => void): void;
    once(event: "destroyed", listener: () => void): void;
  },
  prefs: {
    getPrefs(): Promise<ZoomPrefs>;
    subscribePrefs(listener: (prefs: ZoomPrefs) => void): () => void;
  },
): void {
  const apply = (next: ZoomPrefs) => {
    if (!contents.isDestroyed()) {
      contents.setZoomFactor(next.window.interfaceZoom / 100);
    }
  };
  contents.once("destroyed", prefs.subscribePrefs(apply));
  contents.on("did-finish-load", () => {
    void prefs.getPrefs().then(apply, () => {});
  });
}
