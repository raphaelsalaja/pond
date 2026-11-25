import { IconArrowUpRight, IconChevronDown } from "@pond/icons";
import { isVideoMedia } from "@pond/schema/changelog";
import type { ChangelogCategory, ChangelogEntry } from "@pond/schema/changelog";
import { Accordion, Button, Changelog, Dialog } from "@pond/ui";
import { useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { loadAppInfo } from "@/shared/lib/app-info";
import {
  readWhatsNewSeen,
  useWhatsNewDialog,
  whatsNewDialog,
  writeWhatsNewSeen,
} from "@/shared/state/whats-new";
import { CHANGELOG, mediaUrl, unseenVersions } from "./entries";
import styles from "./styles.module.css";

const RELEASES_URL = "https://github.com/raphaelsalaja/pond/releases";
const CHECK_DELAY_MS = 1500;

/** Offers once per version change, after the Library has had a moment to load. */
function useAnnounceAfterUpdate(): void {
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const { version } = await loadAppInfo();
        const lastSeen = readWhatsNewSeen();
        if (!active || lastSeen === version) {
          return;
        }
        const hasSaves =
          lastSeen !== null ||
          (await window.pond.query("saves.sidebarCounts", {})).library > 0;
        if (!active) {
          return;
        }
        const versions = unseenVersions({
          entries: CHANGELOG,
          current: version,
          lastSeen,
          hasSaves,
        });
        const latest = CHANGELOG.find((entry) => entry.version === versions[0]);
        if (!latest) {
          writeWhatsNewSeen(version);
          return;
        }
        whatsNewDialog.offer(version, versions);
      } catch {
        /** The offer is a courtesy; a failed lookup skips it until the next launch. */
      }
    };
    const timer = setTimeout(() => {
      void check();
    }, CHECK_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function Items({
  items,
  className,
}: {
  items: ReadonlyArray<string>;
  className?: string;
}) {
  return (
    <Changelog.List className={className}>
      {items.map((item) => (
        <Changelog.Item key={item}>{item}</Changelog.Item>
      ))}
    </Changelog.List>
  );
}

/** Media illustrates the title beside it, so assistive tech skips it. */
function Media({ entry }: { entry: ChangelogEntry }) {
  const reduceMotion = useReducedMotion() ?? false;
  const src = mediaUrl(entry);
  if (!src || !entry.media) return null;
  return isVideoMedia(entry.media) ? (
    <video
      className={styles.media}
      src={src}
      autoPlay={!reduceMotion}
      muted
      loop
      playsInline
      aria-hidden
    />
  ) : (
    <img className={styles.media} src={src} alt="" />
  );
}

function Headline({ entry }: { entry: ChangelogEntry }) {
  return (
    <>
      <Dialog.Title className={styles.title}>{entry.title}</Dialog.Title>
      <Media entry={entry} />
      <Changelog.Summary className={styles.summary}>
        {entry.summary}
      </Changelog.Summary>
    </>
  );
}

const LABELS = {
  important: "Important",
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
} satisfies Record<ChangelogCategory, string>;

function Details({
  latest,
  earlier,
}: {
  latest: ChangelogEntry;
  earlier: ReadonlyArray<ChangelogEntry>;
}) {
  const important = latest.sections.some((s) => s.category === "important");

  return (
    <Accordion.Root
      className={styles.details}
      defaultValue={important ? ["important"] : []}
    >
      {latest.sections.map(({ category, items }) => (
        <Accordion.Item key={category} value={category}>
          <Accordion.Header>
            <Accordion.Trigger>
              {LABELS[category]}
              <span className={styles.count}>{items.length}</span>
              <IconChevronDown size={12} />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>
            <Items items={items} className={styles.list} />
          </Accordion.Panel>
        </Accordion.Item>
      ))}
      {earlier.map((entry) => (
        <Accordion.Item key={entry.version} value={entry.version}>
          <Accordion.Header>
            <Accordion.Trigger>
              Pond {entry.version}
              <span className={styles.count}>{formatDate(entry.date)}</span>
              <IconChevronDown size={12} />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>
            <Changelog.Title className={styles.earlier}>
              {entry.title}
            </Changelog.Title>
            <Changelog.Summary>{entry.summary}</Changelog.Summary>
            {entry.sections.map((section) => (
              <Changelog.Section
                key={section.category}
                category={section.category}
              >
                <Changelog.Heading />
                <Items items={section.items} />
              </Changelog.Section>
            ))}
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}

export function WhatsNewDialog() {
  const { open, versions } = useWhatsNewDialog();
  useAnnounceAfterUpdate();

  const filtered = versions
    ? CHANGELOG.filter((entry) => versions.includes(entry.version))
    : CHANGELOG;
  const [latest, ...earlier] = filtered.length > 0 ? filtered : CHANGELOG;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          whatsNewDialog.close();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Header className={styles.header}>
            <span className={styles.date}>
              {latest ? formatDate(latest.date) : null}
            </span>
            <Button
              size="xs"
              variant="ghost"
              className={styles.link}
              onClick={() => void window.pond.openExternal(RELEASES_URL)}
            >
              What&apos;s New
              <IconArrowUpRight size={12} />
            </Button>
            <Dialog.Close />
          </Dialog.Header>
          {latest ? (
            <Dialog.Content className={styles.content}>
              <Headline entry={latest} />
              <Details latest={latest} earlier={earlier} />
            </Dialog.Content>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
