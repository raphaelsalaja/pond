import { useEffect } from "react";
import { notify } from "@/shared/lib/toast";

const EXTENSION_CAPTURE_RE =
  /^(twitter|instagram|pinterest|arena|cosmos|tiktok|youtube|reddit|threads):/;

export function ExtensionCaptureToast() {
  useEffect(() => {
    return window.pond.onSyncAction((action) => {
      if (action.modelName !== "save" || action.action !== "I") return;
      if (!EXTENSION_CAPTURE_RE.test(action.actorReason ?? "")) return;
      notify({
        id: "extension-capture",
        title: "Saved to Pond",
      });
    });
  }, []);

  return null;
}
