import log from "electron-log/renderer";

/** Dev-only React Scan, toggled from the Developer menu; the hook itself is injected ahead of main.tsx. */
let enabled = false;
let started = false;

async function toggle(): Promise<void> {
  enabled = !enabled;
  const { scan, setOptions } = await import("react-scan");
  if (started) {
    setOptions({ enabled, showToolbar: enabled });
    return;
  }
  started = true;
  scan({ enabled, showToolbar: enabled });
}

window.pond.onReactScanToggle(() => {
  void toggle().catch((cause: unknown) => {
    log.error("[react-scan] toggle failed", cause);
  });
});
