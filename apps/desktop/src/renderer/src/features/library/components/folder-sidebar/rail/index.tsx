import {
  IconCanvas,
  IconInbox,
  IconLibrary,
  IconNodes3,
  IconTag,
  IconWindowDownload,
} from "@pond/icons";
import { ToggleGroup, Tooltip } from "@pond/ui";
import { FISH_COLORS, FISH_SPECIES } from "@shared/fish-contracts";
import { QueueSummarySchema } from "@shared/queue-contracts";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { FishMark } from "@/features/fish";
import { useFishList } from "@/features/fish/state/fish";
import { WorkspaceMenu } from "@/features/library/components/workspace-menu";
import { useSidebarCounts } from "@/features/library/hooks/use-sidebar-counts";
import { useInboxSignal } from "@/features/notifications";
import { UpdateButton } from "@/features/settings";
import { preloadWhenIdle } from "@/shared/lib/lazy-with-preload";
import type { ShortcutId } from "@/shared/lib/shortcuts";
import { usePrefs } from "@/shared/state/prefs";
import { preloadLibraryNav, selectLibraryNav } from "../navigation";
import { HelpMenu } from "./help-menu";
import { Item } from "./item";
import styles from "./styles.module.css";
import { WhatsNewButton } from "./whats-new-button";

export type RailSection = "library" | "fish" | "canvases";
export type RailPage = "inbox" | "tags" | "sources" | "downloads";
export type RailItem = RailSection | RailPage;

const SECTIONS: RailSection[] = ["fish", "library", "canvases"];
const PAGES: RailPage[] = ["inbox", "tags", "sources", "downloads"];

const LABELS = {
  library: "Library",
  fish: "Fish",
  canvases: "Canvases",
  inbox: "Inbox",
  tags: "Tags",
  sources: "Sources",
  downloads: "Downloads",
} satisfies Record<RailItem, string>;

const SHORTCUTS = new Map<RailItem, ShortcutId>([
  ["library", "nav.library"],
  ["fish", "nav.fish"],
  ["canvases", "nav.canvases"],
  ["inbox", "nav.inbox"],
  ["sources", "nav.sources"],
  ["downloads", "nav.downloads"],
]);

export function isRailPage(kind: string): kind is RailPage {
  return PAGES.some((page) => page === kind);
}

interface RailProps {
  value: RailItem | null;
  sections: readonly RailSection[];
  onSectionChange: (section: RailSection) => void;
}

function LeadFish() {
  const lead = useFishList()[0];
  return (
    <FishMark
      color={lead?.color ?? FISH_COLORS[0]}
      species={lead?.species ?? FISH_SPECIES[0]}
    />
  );
}

function icon(item: RailItem): ReactNode {
  switch (item) {
    case "library":
      return <IconLibrary />;
    case "fish":
      return <LeadFish />;
    case "canvases":
      return <IconCanvas />;
    case "inbox":
      return <IconInbox />;
    case "tags":
      return <IconTag />;
    case "sources":
      return <IconNodes3 />;
    case "downloads":
      return <IconWindowDownload />;
  }
}

export function Rail({ value, sections, onSectionChange }: RailProps) {
  const [sidebar] = usePrefs("sidebar");
  const counts = useSidebarCounts();
  const inbox = useInboxSignal();
  const queueSummary = useQuery({
    queryKey: ["queue.summary"],
    queryFn: async () =>
      QueueSummarySchema.parse(await window.pond.query("queue.summary", {})),
    refetchInterval: 2_000,
    enabled: sidebar.destinations.downloads,
  });
  const badges = new Map<RailPage, number | undefined>([
    ["inbox", counts.inbox + inbox.priority],
    ["downloads", queueSummary.data?.actionable],
  ]);
  const dots = new Map<RailPage, "live" | "negative" | undefined>([
    [
      "inbox",
      inbox.attention ? "negative" : inbox.working ? "live" : undefined,
    ],
  ]);
  useEffect(
    () =>
      preloadWhenIdle(
        ...PAGES.map((kind) => () => preloadLibraryNav({ kind })),
      ),
    [],
  );

  function page(kind: RailPage) {
    return (
      <Item
        key={kind}
        value={kind}
        label={LABELS[kind]}
        icon={icon(kind)}
        shortcut={SHORTCUTS.get(kind)}
        count={badges.get(kind)}
        dot={dots.get(kind)}
        current={value === kind}
        onSelect={() => selectLibraryNav({ kind })}
      />
    );
  }

  return (
    <nav className={styles.rail} aria-label="Sidebar Sections">
      <Tooltip.Group>
        <WorkspaceMenu />
        <ToggleGroup
          className={styles.items}
          variant="rail"
          orientation="vertical"
          aria-label="Section"
          value={value ? [value] : []}
        >
          {SECTIONS.filter((section) => sections.includes(section)).map(
            (section) => (
              <Item
                key={section}
                value={section}
                label={LABELS[section]}
                icon={icon(section)}
                shortcut={SHORTCUTS.get(section)}
                onSelect={() => onSectionChange(section)}
              />
            ),
          )}
          {PAGES.filter((kind) => sidebar.destinations[kind]).map(page)}
          <span className={styles.spacer} aria-hidden />
          <UpdateButton />
          <WhatsNewButton />
        </ToggleGroup>
        <HelpMenu />
      </Tooltip.Group>
    </nav>
  );
}
