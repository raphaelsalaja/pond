import { IconDotsFill18 as Ellipsis } from "@pond/icons/fill/18";
import {
  IconClone2Outline18 as Copy,
  IconTrash2Outline18 as DeleteForever,
  IconFileOutline18 as File,
  IconFolderOutline18 as FilePath,
  IconGlobeOutline18 as Globe,
  IconImageOutline18 as Image,
  IconBracketsCurlyOutline18 as Json,
  IconLink2Outline18 as Link,
  IconWindowShareOutline18 as OpenExternal,
  IconFileRefreshOutline18 as Refresh,
  IconArrowRotateAnticlockwiseOutline18 as Restore,
  IconFolderOpenOutline18 as Reveal,
  IconScanImageOutline18 as ScanImage,
  IconMagnifierOutline18 as Search,
  IconTrash2Outline18 as Trash,
  IconVectorOutline18 as Vector,
  IconWandSparkleOutline18 as Wand,
} from "@pond/icons/outline/18";
import { Menu, type MenuItemSpec } from "@pond/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  rebuildVisualIndex,
  reembed,
  TASK_ENABLED,
} from "@/lib/enrichment/tasks";
import {
  copyableImageIndex,
  copyFile,
  copyFilePath,
  copyImage,
  copyUrl,
  openDefaultApp,
  openInBrowser,
  purgeForever,
  refreshSaveMetadata,
  revealFile,
  trashSave,
  untrashSave,
} from "@/lib/save/actions";
import {
  hasPublicImageUrl,
  REVERSE_SEARCH_ENGINES,
  reverseImageSearch,
} from "@/lib/save/reverse-image-search";
import { shortcutGlyphs } from "@/lib/save/shortcuts";
import type { Save } from "@/lib/types";
import { REVEAL_LABEL } from "@/lib/ui/platform";
import { closeSave } from "@/lib/ui/save-nav";
import { activity } from "@/stores/activity";
import { usePrefsValue } from "@/stores/prefs";

export function KebabMenu({
  save,
  fileIndex = null,
}: {
  save: Save;
  /** Active viewer file; when set, Open/Copy/Reveal target that asset. */
  fileIndex?: number | null;
}) {
  const prefs = usePrefsValue();
  const [canReverseSearch, setCanReverseSearch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void hasPublicImageUrl(save.id).then((ok) => {
      if (!cancelled) setCanReverseSearch(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [save.id]);

  const hasUrl = Boolean(save.url);
  const hasFiles = save.files.length > 0;
  const hasRawJson = Boolean(save.rawJson);
  const isTrashed = Boolean(save.deletedAt);
  const hasImage = copyableImageIndex(save, fileIndex) != null;

  const closeDetail = useCallback(() => {
    closeSave();
  }, []);

  const onTrash = useCallback(async () => {
    await trashSave(save);
    closeDetail();
  }, [save, closeDetail]);

  const onRestore = useCallback(async () => {
    await untrashSave(save);
  }, [save]);

  const onPurge = useCallback(async () => {
    await purgeForever(save);
    closeDetail();
  }, [save, closeDetail]);

  /** Silent, matching the system convention that Cmd+C confirms nothing. */
  const copyRawJson = useCallback(async () => {
    if (!save.rawJson) return;
    await window.pond.query("clipboard.writeText", {
      text: JSON.stringify(save.rawJson, null, 2),
    });
  }, [save]);

  const items = useMemo<MenuItemSpec[]>(
    () => [
      {
        type: "submenu",
        label: "Open",
        icon: <OpenExternal />,
        hidden: !hasFiles && !hasUrl,
        items: [
          {
            label: "Default App",
            icon: <OpenExternal />,
            shortcut: shortcutGlyphs("save.open"),
            hidden: !hasFiles,
            onClick: () => void openDefaultApp(save, fileIndex),
          },
          {
            label: "Original Source",
            icon: <Globe />,
            hidden: !hasUrl,
            onClick: () => void openInBrowser(save),
          },
          {
            label: REVEAL_LABEL,
            icon: <Reveal />,
            hidden: !hasFiles,
            onClick: () => void revealFile(save, fileIndex),
          },
        ],
      },

      {
        type: "submenu",
        label: "Copy",
        icon: <Copy />,
        hidden: !hasUrl && !hasFiles && !hasRawJson,
        items: [
          {
            label: "File",
            icon: <File />,
            hidden: !hasFiles,
            shortcut: shortcutGlyphs("save.copy-image"),
            onClick: () => void copyFile(save, fileIndex),
          },
          {
            label: "Image",
            icon: <Image />,
            shortcut: shortcutGlyphs("save.copy-image"),
            hidden: !hasImage,
            onClick: () => void copyImage(save, fileIndex),
          },
          {
            label: "Link",
            icon: <Link />,
            shortcut: shortcutGlyphs("save.copy-url"),
            hidden: !hasUrl,
            onClick: () => {
              if (save.url) void copyUrl(save.url);
            },
          },
          {
            label: "File Path",
            icon: <FilePath />,
            hidden: !hasFiles,
            onClick: () => void copyFilePath(save, fileIndex),
          },
          { type: "separator" },
          {
            label: "Raw JSON",
            icon: <Json />,
            hidden: !hasRawJson,
            onClick: () => void copyRawJson(),
          },
        ],
      },
      { type: "separator" },
      {
        type: "submenu",
        label: "Search",
        icon: <Search />,
        hidden: !canReverseSearch,
        items: REVERSE_SEARCH_ENGINES.map((engine) => ({
          label: engine.label,
          onClick: () => void reverseImageSearch(save, engine.key),
        })),
      },
      {
        type: "submenu",
        label: "Enhance",
        icon: <Wand />,
        items: [
          {
            label: "Metadata",
            icon: <Refresh />,
            shortcut: shortcutGlyphs("save.refresh"),
            hidden: !hasUrl,
            onClick: () => void refreshSaveMetadata(save),
          },
          { type: "separator" },
          {
            label: "Semantic Index",
            icon: <Vector />,
            disabled: !TASK_ENABLED.reembed(prefs),
            onClick: () => {
              const result = reembed([save.id]);
              if (!result.ok) activity.error("Semantic Index", result.message);
            },
          },
          {
            label: "Visual Index",
            icon: <ScanImage />,
            disabled: !TASK_ENABLED.clip(prefs),
            onClick: () => {
              const result = rebuildVisualIndex([save.id]);
              if (!result.ok) activity.error("Visual Index", result.message);
            },
          },
        ],
      },
      { type: "separator" },
      ...(isTrashed
        ? ([
            {
              label: "Restore from Trash",
              icon: <Restore />,
              shortcut: shortcutGlyphs("save.restore"),
              onClick: () => void onRestore(),
            },
            {
              label: "Delete Forever",
              icon: <DeleteForever />,
              shortcut: shortcutGlyphs("save.delete-forever"),
              onClick: () => void onPurge(),
            },
          ] satisfies MenuItemSpec[])
        : ([
            {
              label: "Move to Trash",
              icon: <Trash />,
              shortcut: shortcutGlyphs("save.trash"),
              onClick: () => void onTrash(),
            },
          ] satisfies MenuItemSpec[])),
    ],
    [
      save,
      fileIndex,
      hasUrl,
      hasFiles,
      hasRawJson,
      hasImage,
      canReverseSearch,
      isTrashed,
      onTrash,
      onRestore,
      onPurge,
      prefs,
      copyRawJson,
    ],
  );

  return (
    <Menu.Root>
      <Menu.Trigger variant="ghost" size="sm" icon>
        <Ellipsis />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="start" sideOffset={6}>
          <Menu.Popup>
            <Menu.Items items={items} />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
