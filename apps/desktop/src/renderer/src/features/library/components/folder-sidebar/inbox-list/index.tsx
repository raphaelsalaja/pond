import { Loader, Sidebar } from "@pond/ui";
import type { InboxNotification } from "@shared/notification-contracts";
import { useId } from "react";
import type { ReactNode } from "react";
import { SaveThumb } from "@/features/library/components/command-menu/save-thumb";
import { useInboxItems } from "@/features/library/hooks/use-inbox-items";
import type { InboxItem } from "@/features/library/hooks/use-inbox-items";
import {
  inboxPicker,
  inboxReview,
  useInboxReview,
  useInboxReviewScope,
  useInboxSelection,
} from "@/features/library/state/inbox-review";
import {
  inboxSections,
  useCollapsedInboxSections,
} from "@/features/library/state/inbox-sections";
import { NotificationIcon, notificationTone } from "@/features/notifications";
import type { InboxProgress } from "@/features/notifications";
import {
  displayTitleForSave,
  SaveCollectionContextMenu,
} from "@/features/saves";
import { useSave } from "@/features/saves/pool";
import { formatDayMonth } from "@/shared/lib/format";
import { compactAge } from "@/shared/lib/relative-time";
import { InboxHeader } from "./header";
import { SourceMark } from "./source-mark";
import styles from "./styles.module.css";

function Lines({
  title,
  detail,
  at,
}: {
  title: string;
  detail: ReactNode;
  at: number;
}) {
  return (
    <Sidebar.ItemText>
      <span className={styles.line}>
        <Sidebar.ItemLabel className={styles.label}>{title}</Sidebar.ItemLabel>
        {at > 0 ? (
          <time className={styles.time} dateTime={new Date(at).toISOString()}>
            {compactAge(at)}
          </time>
        ) : null}
      </span>
      {detail ? <Sidebar.ItemDetail>{detail}</Sidebar.ItemDetail> : null}
    </Sidebar.ItemText>
  );
}

function SaveItem({
  id,
  current,
  unread,
  at,
  onClick,
}: {
  id: string;
  current: boolean;
  unread: boolean;
  at: number;
  onClick: () => void;
}) {
  const save = useSave(id);
  const title = save ? displayTitleForSave(save) : "";

  return (
    <Sidebar.Item
      size="lg"
      className={styles.item}
      data-kind="save"
      data-save-id={id}
      data-inbox
      data-status={current ? "active" : undefined}
      data-unread={unread || undefined}
      aria-current={current ? "true" : undefined}
      aria-label={title}
      onClick={onClick}
    >
      <Sidebar.Icon>
        {save ? <SaveThumb save={save} size={28} /> : null}
      </Sidebar.Icon>
      <Sidebar.ItemLabel className={styles.label}>{title}</Sidebar.ItemLabel>
      <span className={styles.meta}>
        {at > 0 ? (
          <time className={styles.date} dateTime={new Date(at).toISOString()}>
            {formatDayMonth(at)}
          </time>
        ) : null}
        {save ? <SourceMark save={save} size={12} /> : null}
      </span>
    </Sidebar.Item>
  );
}

function NotificationItem({
  notification,
  current,
  unread,
}: {
  notification: InboxNotification;
  current: boolean;
  unread: boolean;
}) {
  return (
    <Sidebar.Item
      size="lg"
      className={styles.item}
      data-status={current ? "active" : undefined}
      data-unread={unread || undefined}
      data-tone={notificationTone(notification.kind)}
      aria-current={current ? "true" : undefined}
      onClick={() => inboxPicker.select(notification.id)}
    >
      <Sidebar.Icon className={styles.glyph}>
        <NotificationIcon kind={notification.kind} size={18} />
      </Sidebar.Icon>
      <Lines
        title={notification.title}
        detail={notification.body}
        at={notification.updatedAt}
      />
    </Sidebar.Item>
  );
}

function ProgressItem({
  progress,
  current,
}: {
  progress: InboxProgress;
  current: boolean;
}) {
  return (
    <Sidebar.Item
      size="lg"
      className={styles.item}
      data-status={current ? "active" : undefined}
      aria-current={current ? "true" : undefined}
      onClick={() => inboxPicker.select(progress.id)}
    >
      <Sidebar.Icon className={styles.glyph}>
        <Loader.Spinner />
      </Sidebar.Icon>
      <Lines
        title={progress.title}
        detail={progress.detail}
        at={progress.startedAt ?? 0}
      />
    </Sidebar.Item>
  );
}

function Item({
  item,
  selected,
  index,
}: {
  item: InboxItem;
  selected: string | null;
  index: number | null;
}) {
  switch (item.type) {
    case "progress":
      return (
        <ProgressItem
          progress={item.progress}
          current={selected === item.progress.id}
        />
      );
    case "notification":
      return (
        <NotificationItem
          notification={item.notification}
          current={selected === item.notification.id}
          unread={item.unread}
        />
      );
    case "save":
      return (
        <SaveItem
          id={item.id}
          current={selected === null && index === item.index}
          unread={item.unread}
          at={item.at}
          onClick={() => inboxReview.jump(item.index)}
        />
      );
  }
}

type Run = { section: string | null; items: Array<InboxItem> };

/** Splits the list where the section changes; running-work rows lead with no heading. */
function runs(items: ReadonlyArray<InboxItem>): Array<Run> {
  const out: Array<Run> = [];
  for (const item of items) {
    const section = item.type === "progress" ? null : (item.section ?? null);
    const last = out.at(-1);
    if (last && last.section === section) last.items.push(item);
    else out.push({ section, items: [item] });
  }
  return out;
}

/** A pinned band that names the section, counts it and folds it shut. */
function Section({
  section,
  count,
  open,
  children,
}: {
  section: string;
  count: number;
  open: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.sectionHeader}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => inboxSections.toggle(section)}
      >
        {section}
        <span className={styles.sectionCount}>{count}</span>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path
            d="M6.75 10.62c-.33.2-.75-.04-.75-.43V5.81c0-.39.42-.63.75-.43l3.76 2.19c.33.19.33.67 0 .86l-3.76 2.19z"
            fill="currentColor"
          />
        </svg>
      </button>
      {open ? (
        <Sidebar.GroupContent id={id} aria-label={section}>
          {children}
        </Sidebar.GroupContent>
      ) : null}
    </div>
  );
}

export function InboxList() {
  const queue = useInboxReview();
  const scope = useInboxReviewScope() ?? "review";
  const selected = useInboxSelection();
  const items = useInboxItems();
  const collapsed = useCollapsedInboxSections();
  const label = scope === "snoozed" ? "Snoozed" : "Inbox";

  // The group itself is the menu trigger, so its header stays the first child the sidebar pins as the panel header.
  return (
    <SaveCollectionContextMenu
      acceptsBackground={() => false}
      buildBackgroundItems={() => []}
      onOpenSave={(save) => {
        const index = queue?.ids.indexOf(save.id) ?? -1;
        if (index >= 0) inboxReview.jump(index);
      }}
    >
      <Sidebar.Group>
        <InboxHeader scope={scope} />
        {runs(items).map((run) => {
          const rows = run.items.map((item) => (
            <Item
              key={item.key}
              item={item}
              selected={selected}
              index={queue?.index ?? null}
            />
          ));
          return run.section ? (
            <Section
              key={run.section}
              section={run.section}
              count={run.items.length}
              open={!collapsed.has(run.section)}
            >
              {rows}
            </Section>
          ) : (
            <Sidebar.GroupContent key="" aria-label={label}>
              {rows}
            </Sidebar.GroupContent>
          );
        })}
        {queue && items.length === 0 ? (
          <Sidebar.Empty>
            {scope === "snoozed" ? "Nothing snoozed" : "Nothing to review"}
          </Sidebar.Empty>
        ) : null}
      </Sidebar.Group>
    </SaveCollectionContextMenu>
  );
}
