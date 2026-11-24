import { IconBookmark, IconFilterOff } from "@pond/icons";
import type { FieldId, Predicate } from "@pond/schema/filters/types";
import { Menu, SplitButton } from "@pond/ui";
import { libraryHeader } from "@/features/library/state/library-header";
import {
  setSemanticQuery,
  setVisualProbe,
  useActiveViewId,
  useSemanticQuery,
  useVisualProbe,
} from "@/features/library/state/view-store";
import { FieldSubmenu, OverlaySubmenu } from "../add";
import { FilterPopup } from "../chip";
import { presetOptions } from "../options";
import type { FilterOption } from "../options";
import { filterSummary } from "../summary";
import type { FilterChipId } from "../toolbar-state";
import { clearFilters, saveFilterView, saveViewLabel } from "../view-actions";
import styles from "./styles.module.css";

interface AppliedFiltersProps {
  choices: Partial<Record<FieldId, Array<FilterOption>>>;
  rows: Array<Predicate>;
  onChange: (rows: Array<Predicate>) => void;
  applied: ReadonlyArray<FilterChipId>;
}

function inField(row: Predicate, field: FieldId): boolean {
  return row.field === field || (field === "width" && row.field === "height");
}

function removeItem(onRemove: () => void) {
  return (
    <>
      <Menu.Separator />
      <Menu.Item onClick={onRemove}>
        <Menu.ItemIcon>
          <IconFilterOff />
        </Menu.ItemIcon>
        <Menu.ItemLabel>Remove Filter</Menu.ItemLabel>
      </Menu.Item>
    </>
  );
}

export function AppliedFilters({
  choices,
  rows,
  onChange,
  applied,
}: AppliedFiltersProps) {
  const semantic = useSemanticQuery();
  const visual = useVisualProbe();
  const activeViewId = useActiveViewId();
  const label = applied.length === 1 ? "1 Filter" : `${applied.length} Filters`;
  const optionsFor = (field: FieldId) => choices[field] ?? presetOptions(field);
  return (
    <Menu.Root
      onOpenChange={(next) => {
        if (next) {
          libraryHeader.closePopover();
        }
      }}
    >
      <Menu.Trigger render={<SplitButton.Action />}>{label}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={8}>
          <FilterPopup className={styles.popup} aria-label="Applied Filters">
            <Menu.Group>
              {applied.map((id) =>
                id === "semantic" || id === "visual" ? (
                  <OverlaySubmenu
                    key={id}
                    overlay={id}
                    detail={
                      id === "semantic" ? `“${semantic ?? ""}”` : visual?.label
                    }
                  >
                    {removeItem(() =>
                      id === "semantic"
                        ? setSemanticQuery(null)
                        : setVisualProbe(null),
                    )}
                  </OverlaySubmenu>
                ) : (
                  <FieldSubmenu
                    key={id}
                    field={id}
                    options={optionsFor(id)}
                    rows={rows}
                    onChange={onChange}
                    detail={filterSummary(
                      rows.filter((row) => inField(row, id)),
                      optionsFor(id),
                    )}
                  >
                    {removeItem(() =>
                      onChange(rows.filter((row) => !inField(row, id))),
                    )}
                  </FieldSubmenu>
                ),
              )}
            </Menu.Group>
            <Menu.Separator />
            <Menu.Item onClick={() => saveFilterView(activeViewId)}>
              <Menu.ItemIcon>
                <IconBookmark />
              </Menu.ItemIcon>
              <Menu.ItemLabel>{saveViewLabel(activeViewId)}</Menu.ItemLabel>
            </Menu.Item>
            <Menu.Item onClick={clearFilters}>
              <Menu.ItemIcon>
                <IconFilterOff />
              </Menu.ItemIcon>
              <Menu.ItemLabel>Clear Filters</Menu.ItemLabel>
            </Menu.Item>
          </FilterPopup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
