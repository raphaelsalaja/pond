import { updateDialogCopy } from "./copy";
import type { UpdateDialogView } from "./session";

export interface UpdateDialogPrompt {
  title: string;
  description: string;
  action: string;
  pending: boolean;
  cancel: string | null;
}

export function updateDialogPrompt(view: UpdateDialogView): UpdateDialogPrompt {
  switch (view.kind) {
    case "checking":
      return {
        title: "Checking for Updates",
        description: "Looking for a newer version of Pond.",
        action: "Checking",
        pending: true,
        cancel: "Cancel",
      };
    case "current":
      return {
        title: "You're Up to Date",
        description: `Pond ${view.version} is the latest version.`,
        action: "OK",
        pending: false,
        cancel: null,
      };
    case "failed":
      return {
        title: "Couldn't Check for Updates",
        description: view.message,
        action: view.retry ? "Try Again" : "OK",
        pending: false,
        cancel: view.retry ? "Close" : null,
      };
    case "update": {
      const copy = updateDialogCopy(view.notice);
      if (!copy) {
        return {
          title: "Update Available",
          description: `Pond ${view.notice.version} is downloading.`,
          action: "Downloading",
          pending: true,
          cancel: "Later",
        };
      }
      return { ...copy, pending: false, cancel: "Later" };
    }
  }
}
