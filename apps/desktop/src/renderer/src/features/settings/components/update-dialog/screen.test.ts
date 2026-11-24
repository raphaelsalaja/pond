import { describe, expect, it } from "vitest";
import { updateScreen } from "./screen";

describe("updateScreen", () => {
  it("sweeps the bar while a check runs", () => {
    expect(updateScreen({ kind: "checking" })).toMatchObject({
      title: "Checking for Updates",
      meter: { value: null },
      action: null,
      dismiss: null,
    });
  });

  it("states the installed version when Pond is current", () => {
    expect(updateScreen({ kind: "current", version: "1.4.0" })).toEqual({
      title: "You're Up to Date",
      description: "Pond 1.4.0 is the latest version.",
      meter: { value: 1, label: "Installed" },
      action: "OK",
      dismiss: null,
    });
  });

  it("offers Update before the build is downloading", () => {
    expect(
      updateScreen({
        kind: "update",
        notice: { phase: "available", version: "2.0.0", downloading: false },
      }),
    ).toMatchObject({
      title: "Update Available",
      meter: { value: 0, label: "0%" },
      action: "Update",
      dismiss: "Later",
    });
  });

  it("fills the bar with nothing to press as the download arrives", () => {
    expect(
      updateScreen({
        kind: "update",
        notice: { phase: "available", version: "2.0.0", downloading: true },
      }),
    ).toMatchObject({
      title: "Downloading Update",
      meter: { value: null, label: "Starting download" },
      action: null,
      dismiss: null,
    });
    expect(
      updateScreen({
        kind: "update",
        notice: {
          phase: "available",
          version: "2.0.0",
          downloading: true,
          progress: 0.46,
        },
      }).meter,
    ).toEqual({ value: 0.46, label: "46%" });
  });

  it("offers only Restart to Update once downloaded", () => {
    expect(
      updateScreen({
        kind: "update",
        notice: { phase: "downloaded", version: "2.0.0" },
      }),
    ).toMatchObject({
      title: "Update Ready",
      meter: { value: 1, label: "Ready to install" },
      action: "Restart to Update",
      dismiss: null,
    });
  });

  it("empties the bar when a check fails", () => {
    expect(
      updateScreen({ kind: "failed", message: "Offline.", retry: true }),
    ).toMatchObject({
      meter: { value: 0, label: "Check failed" },
      action: "Try Again",
      dismiss: "Close",
    });
  });

  it("leaves nothing to press while Pond restarts", () => {
    expect(
      updateScreen({ kind: "restarting", version: "2.0.0" }),
    ).toMatchObject({ meter: { value: null }, action: null, dismiss: null });
  });
});
