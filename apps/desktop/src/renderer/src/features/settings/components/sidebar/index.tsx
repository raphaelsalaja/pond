import { Sidebar } from "@pond/ui";
import Fuse from "fuse.js";
import { useEffect, useMemo, useState } from "react";
import {
  SETTINGS_MASTER_GROUPS,
  sectionForId,
  sectionForPath,
} from "@/features/settings/lib/registry";
import type { SectionDef } from "@/features/settings/lib/registry";
import { SETTINGS_SEARCH_INDEX } from "@/features/settings/lib/search-index";
import type { SettingsSearchEntry } from "@/features/settings/lib/search-index";
import { SECTION_PRELOADS } from "@/features/settings/lib/sections";
import { SearchChrome } from "@/shared/components/search-chrome";
import { useRouteLocation } from "@/shared/hooks/use-route-location";
import { preloadWhenIdle } from "@/shared/lib/lazy-with-preload";
import { openSettings } from "@/shared/lib/open-settings";

interface SectionResult {
  section: SectionDef;
  items: Array<SettingsSearchEntry>;
}

export function SettingsSidebar() {
  const pathname = useRouteLocation((location) => location.pathname);
  useEffect(() => preloadWhenIdle(...SECTION_PRELOADS), []);
  const activeSection = pathname.startsWith("/settings/")
    ? pathname.slice("/settings/".length).split("/")[0]
    : null;
  return <SettingsSidebarView activeSection={activeSection ?? null} />;
}

export function SettingsSidebarView({
  activeSection,
}: {
  activeSection: string | null;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim();

  const fuse = useMemo(
    () =>
      new Fuse(SETTINGS_SEARCH_INDEX, {
        includeScore: true,
        ignoreLocation: true,
        threshold: 0.3,
        keys: [
          { name: "title", weight: 3 },
          { name: "keywords", weight: 2 },
          { name: "sectionLabel", weight: 2 },
          { name: "description", weight: 1 },
          { name: "groupTitle", weight: 1 },
        ],
      }),
    [],
  );

  const results = useMemo<Array<SectionResult> | null>(() => {
    if (!needle) {
      return null;
    }
    const bySection = new Map<string, SectionResult>();
    for (const { item } of fuse.search(needle)) {
      const section = sectionForId(item.sectionId);
      if (!section) continue;
      let group = bySection.get(item.sectionId);
      if (!group) {
        group = { section, items: [] };
        bySection.set(item.sectionId, group);
      }
      if (item.itemKey) group.items.push(item);
    }
    return [...bySection.values()];
  }, [needle, fuse]);

  const highlightPath = activeSection
    ? (sectionForPath(activeSection)?.parent ?? activeSection)
    : null;

  const sectionItem = (section: SectionDef) => {
    const active = section.path === highlightPath;
    return (
      <Sidebar.Item
        key={section.path}
        onClick={() => openSettings(section.path)}
        data-status={active ? "active" : undefined}
        aria-current={active ? "page" : undefined}
      >
        <Sidebar.Icon>{section.icon}</Sidebar.Icon>
        <Sidebar.ItemLabel>{section.label}</Sidebar.ItemLabel>
      </Sidebar.Item>
    );
  };

  return (
    <>
      <Sidebar.GroupHeader>
        <Sidebar.GroupLabel>Settings</Sidebar.GroupLabel>
      </Sidebar.GroupHeader>
      <SearchChrome.Root>
        <SearchChrome.Field
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search Settings"
        />
      </SearchChrome.Root>
      {results === null ? (
        SETTINGS_MASTER_GROUPS.map((group) => (
          <Sidebar.Group key={group.group}>
            {group.label ? (
              <Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
            ) : null}
            {group.sections.map(sectionItem)}
          </Sidebar.Group>
        ))
      ) : results.length === 0 ? (
        <Sidebar.Group>
          <Sidebar.Empty>No settings match.</Sidebar.Empty>
        </Sidebar.Group>
      ) : (
        results.map(({ section, items }) => (
          <Sidebar.Group key={section.id}>
            {sectionItem(section)}
            {items.map((item) => (
              <Sidebar.ResultButton
                key={item.id}
                onClick={() =>
                  openSettings(
                    section.path,
                    `setting-${item.sectionId}-${item.itemKey}`,
                  )
                }
              >
                {item.title}
              </Sidebar.ResultButton>
            ))}
          </Sidebar.Group>
        ))
      )}
    </>
  );
}
