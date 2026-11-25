import {
  IconArrowRotateAnticlockwise,
  IconCalendar,
  IconCircleInfo,
  IconCompass,
  IconFilterPlus,
  IconImageSparkle,
  IconLayers,
  IconMediaLibrary,
  IconTextToImage,
} from "@pond/icons";
import type { IconComponent } from "@pond/icons/types";
import { FIELD_META } from "@pond/schema/filters/meta";
import type { FieldId } from "@pond/schema/filters/types";
import { Menu, Tooltip } from "@pond/ui";
import { libraryHeader } from "@/features/library/state/library-header";
import { fieldIcon } from "@/features/search/query";
import { useMenuFilterQuery } from "@/shared/hooks/use-menu-filter-query";
import { FilterPopup } from "../chip";
import { FILTER_SECTIONS, fieldMatchesQuery, presetOptions } from "../options";
import type { FilterOption } from "../options";
import { filterToolbar, useFilterToolbar } from "../toolbar-state";
import styles from "./styles.module.css";

const SECTION_ICONS = {
  Discovery: IconCompass,
  Organize: IconLayers,
  Media: IconMediaLibrary,
  Details: IconCircleInfo,
  Dates: IconCalendar,
} satisfies Record<string, IconComponent>;

export function CustomizeFilters({
  choices,
  activeFields,
  semanticActive,
  visualActive,
}: {
  choices: Partial<Record<FieldId, Array<FilterOption>>>;
  activeFields: Array<FieldId>;
  semanticActive: boolean;
  visualActive: boolean;
}) {
  const { pinned, overlays } = useFilterToolbar();
  const { query: search, onValueChange, reset } = useMenuFilterQuery();
  const overlayQuery = search.trim().toLowerCase();
  const showSemantic = !overlayQuery || "semantic".includes(overlayQuery);
  const showVisual =
    !overlayQuery ||
    "visual match".includes(overlayQuery) ||
    "visual".includes(overlayQuery);
  const sections = FILTER_SECTIONS.map((section) => ({
    ...section,
    fields: section.fields.filter((field) =>
      fieldMatchesQuery(field, search, choices[field] ?? presetOptions(field)),
    ),
  })).filter((section) => section.fields.length > 0);
  const fields = sections.flatMap((section) => section.fields);
  const searching = overlayQuery.length > 0;

  const renderOverlay = (overlay: "visual" | "semantic") => {
    const label = overlay === "visual" ? "Visual Match" : "Semantic";
    const active = overlay === "visual" ? visualActive : semanticActive;
    const Icon = overlay === "visual" ? IconImageSparkle : IconTextToImage;
    return (
      <Menu.CheckboxItem
        key={overlay}
        checked={overlays.includes(overlay)}
        closeOnClick={false}
        onCheckedChange={(checked) =>
          filterToolbar.setOverlayPinned(overlay, checked)
        }
      >
        <Menu.CheckboxItemIndicator />
        <Menu.ItemIcon>
          <Icon />
        </Menu.ItemIcon>
        <Menu.ItemLabel>{label}</Menu.ItemLabel>
        {active ? <Menu.SecondaryLabel>Active</Menu.SecondaryLabel> : null}
      </Menu.CheckboxItem>
    );
  };

  const renderField = (field: FieldId) => {
    const Icon = fieldIcon(field);
    return (
      <Menu.CheckboxItem
        key={field}
        checked={pinned.includes(field)}
        closeOnClick={false}
        onCheckedChange={(checked) => filterToolbar.setPinned(field, checked)}
      >
        <Menu.CheckboxItemIndicator />
        <Menu.ItemIcon>
          <Icon />
        </Menu.ItemIcon>
        <Menu.ItemLabel>{FIELD_META[field].label}</Menu.ItemLabel>
        {activeFields.includes(field) ? (
          <Menu.SecondaryLabel>Active</Menu.SecondaryLabel>
        ) : null}
      </Menu.CheckboxItem>
    );
  };

  const renderSubmenu = (
    label: keyof typeof SECTION_ICONS,
    items: Array<ReturnType<typeof renderField>>,
  ) => {
    const Icon = SECTION_ICONS[label];
    return (
      <Menu.SubmenuRoot key={label}>
        <Menu.SubmenuTrigger>
          <Menu.ItemIcon>
            <Icon />
          </Menu.ItemIcon>
          <Menu.ItemLabel>{label}</Menu.ItemLabel>
        </Menu.SubmenuTrigger>
        <Menu.Portal>
          <Menu.Positioner
            side="inline-end"
            align="start"
            sideOffset={4}
            alignOffset={-6}
          >
            <FilterPopup>{items}</FilterPopup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.SubmenuRoot>
    );
  };

  return (
    <Menu.FilterProvider
      filter={null}
      value={search}
      onValueChange={onValueChange}
    >
      <Menu.Root
        onOpenChange={(open) => {
          if (!open) return;
          libraryHeader.closePopover();
          reset();
        }}
      >
        <Tooltip label="Customize Filters" side="bottom">
          <Menu.Trigger
            icon
            size="sm"
            variant="ghost"
            aria-label="Customize Filters"
          >
            <IconFilterPlus />
          </Menu.Trigger>
        </Tooltip>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="start" sideOffset={6}>
            <FilterPopup className={styles.popup}>
              <Menu.Input aria-label="Find Filter" placeholder="Search…" />
              <Menu.FilterList className={styles.content}>
                <Menu.List>
                  {searching ? (
                    <>
                      {showVisual ? renderOverlay("visual") : null}
                      {showSemantic ? renderOverlay("semantic") : null}
                      {fields.map(renderField)}
                    </>
                  ) : (
                    <>
                      {renderSubmenu("Discovery", [
                        renderOverlay("visual"),
                        renderOverlay("semantic"),
                      ])}
                      {sections.map((section) =>
                        renderSubmenu(
                          section.label,
                          section.fields.map(renderField),
                        ),
                      )}
                    </>
                  )}
                  {searching &&
                  fields.length === 0 &&
                  !showSemantic &&
                  !showVisual ? (
                    <Menu.Item disabled>
                      <Menu.ItemLabel>No matches</Menu.ItemLabel>
                    </Menu.Item>
                  ) : null}
                </Menu.List>
                <Menu.Separator />
                <Menu.Item onClick={() => filterToolbar.restoreDefaults()}>
                  <Menu.ItemIcon>
                    <IconArrowRotateAnticlockwise />
                  </Menu.ItemIcon>
                  <Menu.ItemLabel>Reset Filters</Menu.ItemLabel>
                </Menu.Item>
                <Menu.Item onClick={() => filterToolbar.setLayout("applied")}>
                  <Menu.ItemLabel>Use Applied Filters</Menu.ItemLabel>
                </Menu.Item>
              </Menu.FilterList>
            </FilterPopup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </Menu.FilterProvider>
  );
}
