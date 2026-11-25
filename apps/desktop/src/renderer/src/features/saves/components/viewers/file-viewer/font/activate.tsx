import { IconTypography } from "@pond/icons";
import { useEffect, useState } from "react";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { setFontActivation } from "@/features/saves/lib/font-activation";
import type { Save } from "@/features/saves/types";

export function FontActivate({ save }: { save: Save }) {
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    let active = true;
    void window.pond
      .query("saves.fontStatus", { id: save.id })
      .then((status) => {
        if (active) setActivated(status.activated);
      });
    return () => {
      active = false;
    };
  }, [save.id]);

  return (
    <ViewerHud.Tool
      label={activated ? "Deactivate Font" : "Activate Font"}
      pressed={activated}
      onClick={() => {
        void setFontActivation(save.id, !activated).then((ok) => {
          if (ok) setActivated(!activated);
        });
      }}
    >
      <IconTypography />
    </ViewerHud.Tool>
  );
}
