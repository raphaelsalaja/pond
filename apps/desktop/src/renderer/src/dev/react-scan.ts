/** Dev-only React Scan, toggled from the Developer menu; the hook itself is injected ahead of main.tsx. */
let enabled = false;
let started = false;

window.pond.onReactScanToggle(async () => {
  enabled = !enabled;
  const { scan, setOptions } = await import("react-scan");
  if (started) {
    setOptions({ enabled, showToolbar: enabled });
    return;
  }
  started = true;
  scan({ enabled, showToolbar: enabled });
});

export {};
