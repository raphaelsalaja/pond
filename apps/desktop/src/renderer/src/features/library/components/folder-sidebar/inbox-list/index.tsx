import { Loader, Sidebar } from "@pond/ui";
import type { InboxNotification } from "@shared/notification-contracts";
import { Fragment } from "react";
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
import { NotificationIcon, notificationTone } from "@/features/notifications";
import type { InboxProgress } from "@/features/notifications";
import { displayTitleForSave } from "@/features/saves";
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
    if (last && last.section === section) {
      last.items.push(item);
    } else {
      out.push({ section, items: [item] });
    }
  }
  return out;
}

export function InboxList() {
  const queue = useInboxReview();
  const scope = useInboxReviewScope() ?? "review";
  const selected = useInboxSelection();
  const items = useInboxItems();
  const label = scope === "snoozed" ? "Snoozed" : "Inbox";

  return (
    <Sidebar.Group>
      <InboxHeader scope={scope} />
      {runs(items).map((run) => (
        <Fragment key={run.section ?? ""}>
          {run.section ? (
            <Sidebar.GroupLabel className={styles.section}>
              {run.section}
            </Sidebar.GroupLabel>
          ) : null}
          <Sidebar.GroupContent aria-label={run.section ?? label}>
            {run.items.map((item) => (
              <Item
                key={item.key}
                item={item}
                selected={selected}
                index={queue?.index ?? null}
              />
            ))}
          </Sidebar.GroupContent>
        </Fragment>
      ))}
      {queue && items.length === 0 ? (
        <Sidebar.Empty>
          {scope === "snoozed" ? "Nothing snoozed" : "Nothing to review"}
        </Sidebar.Empty>
      ) : null}
    </Sidebar.Group>
  );
}
