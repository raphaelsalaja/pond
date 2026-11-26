import { IconExternalLink, IconGlobe, IconLink2 } from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import {
  copyUrlsForSelection,
  openInBrowserForSelection,
} from "@/features/saves/lib/selection";
import { isHttpUrl } from "@/features/saves/lib/url-list";
import type { Save } from "@/features/saves/types";
import { shortcutGlyphs } from "@/shared/lib/shortcuts";
import { notify } from "@/shared/lib/toast";
import { glyph, notifyCopy } from "./shared";

export function copyPondLinks(ids: ReadonlyArray<string>): void {
  void window.pond
    .query("saves.copyInternalLinks", { ids: [...ids] })
    .then(() =>
      notify({
        id: "copy-pond-link",
        title: ids.length > 1 ? "Pond links copied" : "Pond link copied",
      }),
    )
    .catch(() =>
      notify({ id: "copy-pond-link", title: "Couldn't copy Pond link" }),
    );
}

/** The link actions of the Save menu, for surfaces that show Saves outside the Library, such as a Canvas or Downloads. */
export function buildSaveLinkItems(
  saves: ReadonlyArray<Save>,
): Array<MenuItemSpec> {
  const ids = saves.map((save) => save.id);
  return [
    {
      label: "Open Original in Browser",
      icon: glyph(IconExternalLink),
      hidden: !saves.some((save) => isHttpUrl(save.url)),
      shortcut: shortcutGlyphs("save.open-url"),
      onClick: () => void openInBrowserForSelection(ids),
    },
    {
      label: "Copy URL",
      icon: glyph(IconGlobe),
      hidden: !saves.some((save) => Boolean(save.url)),
      shortcut: shortcutGlyphs("save.copy-url"),
      onClick: () => void copyUrlsForSelection(ids).then(notifyCopy),
    },
    {
      label: "Copy Pond Link",
      icon: glyph(IconLink2),
      hidden: saves.length === 0,
      onClick: () => copyPondLinks(ids),
    },
  ];
}
