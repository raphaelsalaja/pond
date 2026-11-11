import { IconFolderSearch, IconGrid, IconVersions } from "@pond/icons";
import type { Prefs } from "@pond/schema";
import type { Folder } from "@pond/schema/db";
import { type MenuItemSpec, Sidebar } from "@pond/ui";
import { enterFolder } from "@/features/library/operations/enter-folder";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { FolderIcon, folderColorCss } from "@/shared/lib/folder-icons";
import type { LibraryNav } from "@/shared/lib/library-nav";
import { usePrefs } from "@/shared/state/prefs";
import { useOrganizationTree } from "../../../../hooks/use-organization-tree";
import {
  combineQueries,
  inheritedQueryFor,
} from "../../../../lib/smart-folders";
import { saveFolderPresentation } from "../../../../state/folder-presentation";
import { openOrganizationRenameDialog } from "../../../../state/organization-rename-dialog";
import { saveSavedViewPresentation } from "../../../../state/saved-view-presentation";
import { savedViews, useSavedViews } from "../../../../state/saved-views";
import {
  resetFilters,
  setQuery,
  useViewStore,
} from "../../../../state/view-store";
import { folderIdsForExport } from "../../../folder-context-menu";
import { buildQuickAccessFolderMenuItems } from "../../folder-row-menu";
import { selectLibraryNav } from "../../navigation";
import { Row } from "../../sidebar-row";
import { quickAccessRows } from "./order";

const SAVED_VIEW_ICONS = {
  smart_folder: IconFolderSearch,
  group: IconGrid,
  saved_view: IconVersions,
} as const;

interface QuickAccessProps {
  folderRows: Folder[];
  quickFolders: Folder[];
  folderViews: Prefs["folderViews"];
  folderCounts: Record<string, number>;
  folderDownloading: Record<string, number>;
  badgeStyle: Prefs["sidebar"]["badgeStyle"];
  destination: LibraryNav | null;
  includeSubfolders: boolean;
}

export function QuickAccess({
  folderRows,
  quickFolders,
  folderViews,
  folderCounts,
  folderDownloading,
  badgeStyle,
  destination,
  includeSubfolders,
}: QuickAccessProps) {
  const [savedViewViews] = usePrefs("savedViewViews");
  const views = useSavedViews();
  const { activeViewId } = useViewStore();
  const quickViews = quickAccessRows(views, savedViewViews);
  const quickViewIds = quickViews.map((view) => view.id);
  const quickEntries = [
    ...quickViews.map((view) => ({
      id: `view:${view.id}`,
      name: view.name,
      parentId: null,
    })),
    ...quickFolders.map((folder) => ({
      id: `folder:${folder.id}`,
      name: folder.name,
      parentId: null,
    })),
  ];
  function openQuickSelection(ids: string[]) {
    const selectedFolders = quickFolders.filter((folder) =>
      ids.includes(`folder:${folder.id}`),
    );
    const selectedViews = quickViews.filter((view) =>
      ids.includes(`view:${view.id}`),
    );
    if (ids.length === 1 && selectedFolders[0]) {
      enterFolder(selectedFolders[0].id);
      return;
    }
    resetFilters();
    selectLibraryNav({ kind: "all" });
    if (ids.length === 1 && selectedViews[0]) {
      savedViews.select(selectedViews[0].id);
      return;
    }
    setQuery({
      combinator: "or",
      rules: [
        ...selectedViews.map((view) =>
          combineQueries([inheritedQueryFor(view, views), view.query]),
        ),
        ...selectedFolders.map((folder) => ({
          combinator: "and" as const,
          rules: [
            {
              field: "folder" as const,
              operator: "some" as const,
              value: folderIdsForExport(
                folder.id,
                folderRows,
                includeSubfolders,
              ),
            },
          ],
        })),
      ],
    });
  }
  const quickOrganization = useOrganizationTree(
    quickEntries,
    openQuickSelection,
    destination,
  );
  function quickSelectionItems(): MenuItemSpec[] {
    const ids = quickOrganization.selected;
    const selectedFolderIds = quickFolders
      .filter((folder) => ids.includes(`folder:${folder.id}`))
      .map((folder) => folder.id);
    const selectedViewIds = quickViews
      .filter((view) => ids.includes(`view:${view.id}`))
      .map((view) => view.id);
    return [
      {
        label: `Open ${ids.length} Selected Items`,
        onClick: () => void openQuickSelection(ids),
      },
      {
        label: "Batch Rename Folders",
        hidden: selectedFolderIds.length === 0,
        onClick: () =>
          openOrganizationRenameDialog("folders", selectedFolderIds),
      },
      {
        label: "Batch Rename Smart Folders",
        hidden: selectedViewIds.length === 0,
        onClick: () =>
          openOrganizationRenameDialog("saved-views", selectedViewIds),
      },
      {
        label: "Remove from Quick Access",
        onClick: () =>
          void Promise.all([
            ...selectedFolderIds.map((id) =>
              saveFolderPresentation(id, { quickAccess: false }),
            ),
            ...selectedViewIds.map((id) =>
              saveSavedViewPresentation(id, { quickAccess: false }),
            ),
          ]),
      },
    ];
  }

  async function moveQuickView(id: string, offset: -1 | 1): Promise<void> {
    const current = quickViewIds.indexOf(id);
    const target = current + offset;
    if (current < 0 || target < 0 || target >= quickViewIds.length) return;
    const ordered = [...quickViewIds];
    const [moved] = ordered.splice(current, 1);
    if (!moved) return;
    ordered.splice(target, 0, moved);
    await Promise.all(
      ordered.map((viewId, quickAccessOrder) =>
        saveSavedViewPresentation(viewId, { quickAccessOrder }),
      ),
    );
  }

  if (quickFolders.length === 0 && quickViews.length === 0) return null;

  return (
    <Sidebar.Group
      ref={quickOrganization.root}
      role="tree"
      aria-label="Quick Access"
      aria-multiselectable
    >
      <Sidebar.GroupLabel>Quick Access</Sidebar.GroupLabel>
      {quickViews.map((view, index) => {
        const presentation = savedViewViews[view.id];
        const color = folderColorCss(presentation?.color);
        const ViewIcon = SAVED_VIEW_ICONS[view.kind];
        return (
          <SpecContextMenu
            key={view.id}
            buildItems={() =>
              quickOrganization.selected.includes(`view:${view.id}`) &&
              quickOrganization.selected.length > 1
                ? quickSelectionItems()
                : [
                    {
                      label: `Open ${
                        view.kind === "saved_view"
                          ? "Saved View"
                          : view.kind === "group"
                            ? "Group"
                            : "Smart Folder"
                      }`,
                      onClick: () => {
                        selectLibraryNav({ kind: "all" });
                        savedViews.select(view.id);
                      },
                    },
                    {
                      label: "Remove from Quick Access",
                      onClick: () =>
                        void saveSavedViewPresentation(view.id, {
                          quickAccess: false,
                          quickAccessOrder: undefined,
                        }),
                    },
                    { type: "separator" },
                    {
                      label: "Move Up",
                      disabled: index === 0,
                      onClick: () => void moveQuickView(view.id, -1),
                    },
                    {
                      label: "Move Down",
                      disabled: index === quickViews.length - 1,
                      onClick: () => void moveQuickView(view.id, 1),
                    },
                  ]
            }
          >
            <Row
              label={view.name}
              icon={
                <span style={color ? { color } : undefined}>
                  {presentation?.icon ? (
                    <FolderIcon name={presentation.icon} />
                  ) : (
                    <ViewIcon />
                  )}
                </span>
              }
              active={activeViewId === view.id}
              {...quickOrganization.rowProps(`view:${view.id}`, 0)}
            />
          </SpecContextMenu>
        );
      })}
      {quickFolders.map((folder) => (
        <SpecContextMenu
          key={folder.id}
          buildItems={() =>
            quickOrganization.selected.includes(`folder:${folder.id}`) &&
            quickOrganization.selected.length > 1
              ? quickSelectionItems()
              : buildQuickAccessFolderMenuItems({
                  folder,
                  folderIds: quickFolders.map((entry) => entry.id),
                  onOpen: () => void enterFolder(folder.id),
                })
          }
        >
          <Row
            label={folder.name}
            icon={<FolderIcon name={folderViews[folder.id]?.icon} />}
            count={folderCounts[folder.id] ?? 0}
            downloading={folderDownloading[folder.id] ?? 0}
            badgeStyle={badgeStyle}
            active={
              destination?.kind === "folder" && destination.id === folder.id
            }
            {...quickOrganization.rowProps(`folder:${folder.id}`, 0)}
          />
        </SpecContextMenu>
      ))}
    </Sidebar.Group>
  );
}
