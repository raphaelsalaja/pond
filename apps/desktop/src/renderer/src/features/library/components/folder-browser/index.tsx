import type { Folder } from "@pond/schema/db";
import { Button, Menu } from "@pond/ui";
import type { FolderSummary } from "@shared/folder-contracts";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { FolderCustomizeDialog } from "@/features/library/components/folder-customize-dialog";
import { useLibrarySaveGap } from "@/features/library/components/layouts/save-gap";
import {
  folderColorMenuItems,
  folderIconMenuItems,
} from "@/features/library/lib/folder-appearance-menu";
import { folderCoverUrl } from "@/features/library/lib/folder-cover";
import { buildMoveFolderItems } from "@/features/library/lib/move-folders-menu";
import {
  enterFolder,
  enterFolders,
} from "@/features/library/operations/enter-folder";
import { saveFolderPresentation } from "@/features/library/state/folder-presentation";
import { useFolders } from "@/features/library/state/folders";
import { Card, useDisplayPrefs, useItemInfo } from "@/features/saves";
import { ensureSaves, useSave } from "@/features/saves/pool";
import { ButtonLink } from "@/shared/components/button-link";
import {
  SpecContextMenu,
  SpecMenu,
} from "@/shared/components/spec-context-menu";
import { useResolvedTheme } from "@/shared/hooks/use-resolved-theme";
import { FolderIcon, type FolderIconId } from "@/shared/lib/folder-icons";
import { formatNumber, formatPlural } from "@/shared/lib/format";
import { usePrefs } from "@/shared/state/prefs";
import { useOrganizationTree } from "../../hooks/use-organization-tree";
import { openOrganizationRenameDialog } from "../../state/organization-rename-dialog";
import styles from "./styles.module.css";

const ITEMS = { one: "item", other: "items" };
const SAVES = { one: "save", other: "saves" };

function FolderCard({
  folder,
  summary,
  customCoverSaveId,
  presentation,
  organization,
  galleryFit,
}: {
  organization: ReturnType<typeof useOrganizationTree>;
  folder: Folder;
  summary: FolderSummary | undefined;
  customCoverSaveId: string | null;
  galleryFit: "fit" | "fill";
  presentation: {
    icon?: FolderIconId;
    sortKey: string;
    sortDir: "asc" | "desc";
    quickAccess?: boolean;
    includeSubfolders: boolean;
  };
}) {
  const [customizing, setCustomizing] = useState(false);
  const theme = useResolvedTheme();
  const previewIds = [
    customCoverSaveId,
    ...(summary?.previewSaveIds ?? []),
  ].filter(
    (id, index, ids): id is string => id !== null && ids.indexOf(id) === index,
  );
  const customCover = useSave(customCoverSaveId);
  const previewOffset = customCoverSaveId ? 1 : 0;
  const previewOne = useSave(previewIds[previewOffset]);
  const previewTwo = useSave(previewIds[previewOffset + 1]);
  const previewThree = useSave(previewIds[previewOffset + 2]);
  const previewFour = useSave(previewIds[previewOffset + 3]);
  const previews = [
    customCover,
    previewOne,
    previewTwo,
    previewThree,
    previewFour,
  ]
    .flatMap((save) => {
      if (!save) return [];
      const src = folderCoverUrl(save, 360, theme);
      return src ? [{ id: save.id, src }] : [];
    })
    .slice(0, 4);
  const display = useDisplayPrefs();
  const itemInfo = useItemInfo();
  const directSaveCount = summary?.directSaveCount ?? 0;
  const childFolderCount = summary?.childFolderCount ?? 0;
  const downloadingCount = summary?.downloadingCount ?? 0;
  const empty =
    summary !== undefined &&
    directSaveCount === 0 &&
    childFolderCount === 0 &&
    downloadingCount === 0;
  const metadata = !summary
    ? ""
    : empty
      ? formatPlural(0, ITEMS)
      : [
          directSaveCount > 0 ? formatPlural(directSaveCount, ITEMS) : null,
          downloadingCount > 0
            ? `${formatNumber(downloadingCount)} downloading`
            : null,
          childFolderCount > 0
            ? formatPlural(childFolderCount, {
                one: "subfolder",
                other: "subfolders",
              })
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <li>
      <SpecContextMenu
        buildItems={() => [
          {
            label: "Open Folder",
            onClick: () => void enterFolder(folder.id),
          },
          {
            type: "checkbox",
            label: "Quick Access",
            checked: presentation.quickAccess ?? false,
            onCheckedChange: (quickAccess) =>
              void saveFolderPresentation(folder.id, { quickAccess }),
          },
          {
            type: "submenu",
            label: "Icon",
            items: folderIconMenuItems({
              folderId: folder.id,
              icon: presentation.icon,
              glyphs: false,
            }),
          },
          {
            type: "submenu",
            label: "Color",
            items: folderColorMenuItems({ folder, glyphs: false }),
          },
          {
            type: "submenu",
            label: "Sort By",
            items: [
              ["savedAt", "Date Saved"],
              ["createdAt", "Date Added"],
              ["title", "Title"],
              ["type", "Type"],
              ["random", "Random"],
            ].map(([sortKey, label]) => ({
              type: "checkbox",
              label,
              checked: presentation.sortKey === sortKey,
              onCheckedChange: () =>
                void saveFolderPresentation(folder.id, { sortKey }),
            })),
          },
          {
            type: "checkbox",
            label: "Show Subfolder Contents",
            checked: presentation.includeSubfolders,
            onCheckedChange: (includeSubfolders) =>
              void saveFolderPresentation(folder.id, { includeSubfolders }),
          },
          {
            label: "Customize Folder",
            onClick: () => setCustomizing(true),
          },
        ]}
      >
        <Card.Select
          className={styles.trigger}
          {...organization.rowProps(folder.id, 0)}
          aria-label={
            metadata
              ? `Open ${folder.name}, ${metadata}`
              : `Open ${folder.name}`
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.stopPropagation();
              void enterFolder(folder.id);
            } else organization.rowProps(folder.id, 0).onKeyDown(event);
          }}
          onClick={(event) => {
            if (event.shiftKey || event.metaKey || event.ctrlKey)
              organization.select(folder.id, event);
            else void enterFolder(folder.id);
          }}
          onDoubleClick={() => void enterFolder(folder.id)}
        >
          <Card.Media>
            <span className={styles.cover}>
              {previews.length > 0 ? (
                previews.map((preview) => (
                  <span className={styles.preview} key={preview.id}>
                    <img src={preview.src} alt="" data-fit={galleryFit} />
                  </span>
                ))
              ) : (
                <span className={styles.fallback}>
                  <FolderIcon name={presentation.icon} />
                </span>
              )}
            </span>
          </Card.Media>
          <Card.Meta
            title={display.name ? folder.name : undefined}
            time={itemInfo.visible && metadata ? metadata : undefined}
          />
        </Card.Select>
      </SpecContextMenu>
      {customizing ? (
        <FolderCustomizeDialog
          folder={folder}
          folderIcon={presentation.icon}
          onClose={() => setCustomizing(false)}
        />
      ) : null}
    </li>
  );
}

export function FolderBrowser({
  parentId,
  contentCount,
  downloading = 0,
  children: content,
}: {
  parentId: string;
  contentCount: number;
  downloading?: number;
  children?: ReactNode;
}) {
  const folders = useFolders();
  const [folderViews] = usePrefs("folderViews");
  const [viewer] = usePrefs("viewer");
  const gap = useLibrarySaveGap();
  const children = useMemo(
    () => folders.filter((folder) => folder.parentId === parentId),
    [folders, parentId],
  );
  const organization = useOrganizationTree(children, () => {});
  const [summaries, setSummaries] = useState<FolderSummary[]>([]);

  useEffect(() => {
    if (children.length === 0) {
      setSummaries([]);
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const next = await window.pond.query("folders.summaries", { parentId });
        if (!active) return;
        setSummaries(next);
        const summaryById = new Map(
          next.map((summary) => [summary.id, summary]),
        );
        const coverIds = children.flatMap((folder) => {
          const custom = folderViews[folder.id]?.coverSaveId;
          const previews = summaryById.get(folder.id)?.previewSaveIds ?? [];
          return [custom, ...previews].flatMap((id) =>
            id === null || id === undefined ? [] : [id],
          );
        });
        await ensureSaves(coverIds);
      } catch (error) {
        console.warn("[pond] folder summaries failed", error);
      }
    };
    void load();
    const unsubscribe = window.pond.onSyncAction((event) => {
      if (
        event.modelName === "folder" ||
        event.modelName === "save_folder" ||
        event.modelName === "save"
      ) {
        void load();
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [children, folderViews, parentId]);

  const summaryById = new Map(
    summaries.map((summary) => [summary.id, summary]),
  );

  return (
    <div className={styles.root}>
      {children.length > 0 ? (
        <section className={styles.section} aria-labelledby="subfolders-title">
          <div className={styles.header}>
            <h2 id="subfolders-title">Subfolders ({children.length})</h2>
          </div>
          {organization.selected.length ? (
            <fieldset
              className={styles.selection}
              aria-label="Selected folders"
            >
              <span>{organization.selected.length} folders selected</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => enterFolders(organization.selected, true)}
              >
                Open Selected
              </Button>
              <SpecMenu
                search
                searchLabel="Search folders"
                buildItems={() => buildMoveFolderItems(organization.selected)}
              >
                <Menu.Trigger size="sm" variant="ghost">
                  Move
                </Menu.Trigger>
              </SpecMenu>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  openOrganizationRenameDialog("folders", organization.selected)
                }
              >
                Rename
              </Button>
            </fieldset>
          ) : null}
          <div
            ref={organization.root}
            role="tree"
            aria-label="Subfolders"
            aria-multiselectable
          >
            <ul className={styles.grid} style={{ gap }}>
              {children.map((folder) => (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  organization={organization}
                  galleryFit={viewer.galleryFit}
                  summary={summaryById.get(folder.id)}
                  customCoverSaveId={
                    folderViews[folder.id]?.coverSaveId ?? null
                  }
                  presentation={{
                    icon: folderViews[folder.id]?.icon,
                    sortKey: folderViews[folder.id]?.sortKey ?? "savedAt",
                    sortDir: folderViews[folder.id]?.sortDir ?? "desc",
                    quickAccess: folderViews[folder.id]?.quickAccess,
                    includeSubfolders:
                      folderViews[folder.id]?.includeSubfolders ?? true,
                  }}
                />
              ))}
            </ul>
          </div>
        </section>
      ) : null}
      {content || downloading > 0 ? (
        <section className={styles.section} aria-labelledby="contents-title">
          <div className={styles.header}>
            <h2 id="contents-title">
              Contents ({contentCount.toLocaleString()})
            </h2>
            {downloading > 0 ? (
              <span className={styles.downloading} role="status">
                {`Downloading ${formatPlural(downloading, SAVES)}`}
                <ButtonLink to="/downloads" size="xs" variant="text">
                  Open Downloads
                </ButtonLink>
              </span>
            ) : null}
          </div>
          {content}
        </section>
      ) : null}
    </div>
  );
}
