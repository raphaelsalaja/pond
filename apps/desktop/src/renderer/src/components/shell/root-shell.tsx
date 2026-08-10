import { Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { SettingsModal } from "@/components/settings/modal";
import { Tray } from "@/components/shell/tray";
import { getAppRouter } from "@/lib/ui/app-router";
import { openSave, saveIdFromPath } from "@/lib/ui/save-nav";
import { settingsModal } from "@/stores/settings-modal";

export function RootShell() {
  /** Menu / tray / deep-link navigation arrives over `IPC.nav` as a path string; settings lives in a modal, so its paths open it instead of routing. */
  useEffect(() => {
    return window.pond.onNavigate((path) => {
      const pathname = path.split("?")[0] ?? "";
      if (pathname === "/settings") {
        settingsModal.open();
        return;
      }
      if (pathname.startsWith("/settings/")) {
        settingsModal.open(pathname.slice("/settings/".length));
        return;
      }
      const saveId = saveIdFromPath(pathname);
      if (saveId) {
        openSave(saveId);
        return;
      }
      getAppRouter()?.history.push(pathname);
    });
  }, []);

  return (
    <>
      <Outlet />
      <Tray.Library />
      <SettingsModal />
    </>
  );
}
