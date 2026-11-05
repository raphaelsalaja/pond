import { IconEye } from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import {
  saveHasSensitiveResult,
  saveMarkedSensitive,
  setSensitiveDecision,
} from "@/features/saves/lib/sensitive-decision";
import type { Save } from "@/features/saves/types";
import { glyph } from "./shared";

export function sensitiveContentMenuItem(input: {
  ids: readonly string[];
  saves: readonly Save[];
  allTrashed: boolean;
}): MenuItemSpec {
  const visible = !input.allTrashed && input.saves.some(saveHasSensitiveResult);
  return {
    type: "checkbox",
    label: "Sensitive Content",
    icon: glyph(IconEye),
    indicator: "check",
    keywords: "sensitive nsfw safety not sensitive override clear",
    hidden: !visible,
    checked: input.saves.some(saveMarkedSensitive),
    onCheckedChange: (checked) => {
      void setSensitiveDecision(input.ids, checked);
    },
  };
}
