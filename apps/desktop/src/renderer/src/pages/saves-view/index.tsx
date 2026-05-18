import { Library } from "@/components/library";
import { LibraryChrome, Shell } from "@/components/shell";
import { SaveDetail } from "@/pages/save-detail";
import { LayoutSwitcher } from "./layout-switcher";
import { useCardActions } from "./use-card-actions";
import { type SavesMode, useSavesData } from "./use-saves-data";

interface SavesViewProps {
  mode?: SavesMode;
}

export function SavesView({ mode = "library" }: SavesViewProps) {
  const data = useSavesData(mode);
  const actions = useCardActions(data.filteredIds, mode, data.sourceFilter);

  return (
    <>
      <Shell.Main>
        <LibraryChrome />
        <Library.Root
          view={data.viewMode === "list" ? "list" : "grid"}
          onDragOver={actions.onDragOver}
          onDrop={(e) => void actions.onDrop(e)}
        >
          {data.filtered.length === 0 ? (
            !data.bootReady ? null : data.totalSaves === 0 ? (
              <Library.Empty>
                No saves yet. Drop a link, image, or file to get started.
              </Library.Empty>
            ) : (
              <Library.Empty>
                No matches. Try a different search or clear the filter.
              </Library.Empty>
            )
          ) : (
            <LayoutSwitcher
              viewMode={data.viewMode}
              saves={data.filtered}
              selectedId={data.selectedId}
              multiSelectActive={actions.multiSelectActive}
              onClick={actions.handleCardClick}
              onDoubleClick={actions.focus}
            />
          )}
        </Library.Root>
      </Shell.Main>
      <SaveDetail />
    </>
  );
}
