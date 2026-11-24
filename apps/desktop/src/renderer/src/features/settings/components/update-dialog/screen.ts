import type { UpdateNotice } from "@shared/update-notice";
import type { UpdateDialogView } from "./session";

export interface UpdateMeter {
  /** From 0 to 1, or `null` while the amount is unknown. */
  value: number | null;
  label: string;
}

export interface UpdateScreen {
  title: string;
  description: string;
  meter: UpdateMeter;
  action: string | null;
  dismiss: string | null;
}

function noticeScreen(notice: UpdateNotice): UpdateScreen {
  if (notice.phase === "downloaded") {
    return {
      title: "Update Ready",
      description: "Restart now, or Pond installs it when you quit.",
      meter: { value: 1, label: "Ready to install" },
      action: "Restart to Update",
      dismiss: null,
    };
  }
  if (notice.downloading) {
    const progress = notice.progress;
    return {
      title: "Downloading Update",
      description: `Keep working while Pond ${notice.version} downloads.`,
      meter:
        progress === undefined
          ? { value: null, label: "Starting download" }
          : { value: progress, label: `${Math.round(progress * 100)}%` },
      action: null,
      dismiss: null,
    };
  }
  return {
    title: "Update Available",
    description: `Pond ${notice.version} is ready to download.`,
    meter: { value: 0, label: "0%" },
    action: "Update",
    dismiss: "Later",
  };
}

export function updateScreen(view: UpdateDialogView): UpdateScreen {
  switch (view.kind) {
    case "checking":
      return {
        title: "Checking for Updates",
        description: "Looking for a newer version of Pond.",
        meter: { value: null, label: "Checking" },
        action: null,
        dismiss: null,
      };
    case "current":
      return {
        title: "You're Up to Date",
        description: `Pond ${view.version} is the latest version.`,
        meter: { value: 1, label: "Installed" },
        action: "OK",
        dismiss: null,
      };
    case "failed":
      return {
        title: "Couldn't Check for Updates",
        description: view.message,
        meter: { value: 0, label: "Check failed" },
        action: view.retry ? "Try Again" : "OK",
        dismiss: view.retry ? "Close" : null,
      };
    case "update":
      return noticeScreen(view.notice);
    case "restarting":
      return {
        title: "Restarting Pond",
        description: `Pond ${view.version} opens again in a few seconds.`,
        meter: { value: null, label: "Installing" },
        action: null,
        dismiss: null,
      };
  }
}
