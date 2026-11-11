import { describe, expect, it } from "vitest";
import { updateDialogPrompt } from "./prompt";

describe("updateDialogPrompt", () => {
  it("shows a loading check before the result is known", () => {
    expect(updateDialogPrompt({ kind: "checking" })).toMatchObject({
      title: "Checking for Updates",
      pending: true,
      cancel: "Cancel",
    });
  });

  it("states the installed version when Pond is current", () => {
    expect(updateDialogPrompt({ kind: "current", version: "1.4.0" })).toEqual({
      title: "You're Up to Date",
      description: "Pond 1.4.0 is the latest version.",
      action: "OK",
      pending: false,
      cancel: null,
    });
  });

  it("keeps the download and restart actions for an available update", () => {
    expect(
      updateDialogPrompt({
        kind: "update",
        explicit: true,
        notice: { phase: "available", version: "2.0.0", downloading: false },
      }),
    ).toMatchObject({ title: "Update Available", action: "Download" });
    expect(
      updateDialogPrompt({
        kind: "update",
        explicit: true,
        notice: { phase: "downloaded", version: "2.0.0" },
      }),
    ).toMatchObject({ title: "Update Ready", action: "Restart" });
  });

  it("shows the existing dialog while a requested update is downloading", () => {
    expect(
      updateDialogPrompt({
        kind: "update",
        explicit: true,
        notice: { phase: "available", version: "2.0.0", downloading: true },
      }),
    ).toEqual({
      title: "Update Available",
      description: "Pond 2.0.0 is downloading.",
      action: "Downloading",
      pending: true,
      cancel: "Later",
    });
  });
});
