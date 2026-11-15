import {
  IconAlbum2Fill,
  IconBookmarkSlashFill,
  IconClockFill,
  IconClockPlusFill,
  IconFolderBanFill,
  IconFolderOpenFill,
  IconInboxFill,
  IconNodes3Fill,
  IconTrashFill,
  IconWindowDownloadFill,
} from "@pond/icons";
import { Button, Empty } from "@pond/ui";
import {
  libraryChrome,
  useLibraryNav,
} from "@/features/library/state/library-chrome";
import type { SaveListMode } from "@/features/saves";
import { openSources } from "@/features/sources";
import { ButtonLink } from "@/shared/components/button-link";
import { formatPlural } from "@/shared/lib/format";
import styles from "./styles.module.css";

export function LibraryEmpty() {
  return (
    <Empty.Root>
      <Empty.Media>
        <IconAlbum2Fill size={32} />
      </Empty.Media>
      <Empty.Title>No saves yet</Empty.Title>
      <Empty.Description>
        Connect your first source to start building your library.
      </Empty.Description>
      <Empty.Action>
        <Button
          variant="primary"
          size="sm"
          onClick={() => openSources({ type: "new-source" })}
        >
          New Source
        </Button>
      </Empty.Action>
    </Empty.Root>
  );
}

export function TrashEmpty() {
  return (
    <Empty.Root>
      <Empty.Media>
        <IconTrashFill size={32} />
      </Empty.Media>
      <Empty.Title>Trash is empty</Empty.Title>
      <Empty.Description>
        Deleted saves appear here until they are removed permanently.
      </Empty.Description>
      <Empty.Action>
        <ButtonLink to="/" variant="primary" size="sm">
          Open Library
        </ButtonLink>
      </Empty.Action>
    </Empty.Root>
  );
}

export function LibraryLoading() {
  return (
    <Empty.Root role="status" aria-live="polite">
      <Empty.Media>
        <div className={styles.spinner} aria-hidden="true" />
      </Empty.Media>
      <Empty.Title>Loading library</Empty.Title>
      <Empty.Description>Getting your saves ready.</Empty.Description>
    </Empty.Root>
  );
}

export function UncategorizedEmpty() {
  return (
    <Empty.Root role="status" aria-live="polite">
      <Empty.Media>
        <IconFolderBanFill size={32} />
      </Empty.Media>
      <Empty.Title>No uncategorized saves</Empty.Title>
      <Empty.Description>
        Saves that aren't in a folder appear here.
      </Empty.Description>
      <Empty.Action>
        <ButtonLink
          to="/"
          variant="primary"
          size="sm"
          onClick={() => libraryChrome.setNav({ kind: "all" })}
        >
          Open Library
        </ButtonLink>
      </Empty.Action>
    </Empty.Root>
  );
}

export function InboxEmpty() {
  const nav = useLibraryNav();
  if (nav.kind === "inbox" && nav.snoozed) {
    return (
      <Empty.Root role="status" aria-live="polite">
        <Empty.Media>
          <IconClockFill size={32} />
        </Empty.Media>
        <Empty.Title>Snoozed</Empty.Title>
        <Empty.Description>
          Saves you snooze wait here, then return to the Inbox on time.
        </Empty.Description>
        <Empty.Action>
          <Button
            variant="primary"
            size="sm"
            onClick={() => libraryChrome.setNav({ kind: "inbox" })}
          >
            Open Inbox
          </Button>
        </Empty.Action>
      </Empty.Root>
    );
  }
  return (
    <Empty.Root role="status" aria-live="polite">
      <Empty.Media>
        <IconInboxFill size={32} />
      </Empty.Media>
      <Empty.Title>Inbox</Empty.Title>
      <Empty.Description>
        You're all caught up. New saves wait here until you process them.
      </Empty.Description>
      <Empty.Action>
        <ButtonLink
          to="/"
          variant="primary"
          size="sm"
          onClick={() => libraryChrome.setNav({ kind: "all" })}
        >
          Open Library
        </ButtonLink>
      </Empty.Action>
    </Empty.Root>
  );
}

export function FolderEmpty({ downloading = 0 }: { downloading?: number }) {
  if (downloading > 0) {
    return (
      <Empty.Root role="status" aria-live="polite">
        <Empty.Media>
          <IconWindowDownloadFill size={32} />
        </Empty.Media>
        <Empty.Title>
          {`Downloading ${formatPlural(downloading, { one: "save", other: "saves" })}`}
        </Empty.Title>
        <Empty.Description>
          They appear in this folder as each download finishes.
        </Empty.Description>
        <Empty.Action>
          <ButtonLink to="/downloads" variant="primary" size="sm">
            Open Downloads
          </ButtonLink>
        </Empty.Action>
      </Empty.Root>
    );
  }
  return (
    <Empty.Root role="status" aria-live="polite">
      <Empty.Media>
        <IconFolderOpenFill size={32} />
      </Empty.Media>
      <Empty.Title>This folder is empty</Empty.Title>
      <Empty.Description>
        Drag and drop onto this window to add.
      </Empty.Description>
    </Empty.Root>
  );
}

type LibrarySection = Exclude<SaveListMode, "library" | "trash">;

export function LibrarySectionEmpty({ mode }: { mode: LibrarySection }) {
  const content =
    mode === "untagged"
      ? {
          icon: IconBookmarkSlashFill,
          title: "No untagged saves",
          description: "Saves without tags appear here.",
        }
      : mode === "recents"
        ? {
            icon: IconClockFill,
            title: "No recent saves",
            description: "Recently opened saves appear here.",
          }
        : mode === "recentlyAdded"
          ? {
              icon: IconClockPlusFill,
              title: "No new saves",
              description: "Saves from the last 7 days appear here.",
            }
          : {
              icon: IconNodes3Fill,
              title: "No saves from this source",
              description: "Saves synced from this source appear here.",
            };

  return (
    <Empty.Root role="status" aria-live="polite">
      <Empty.Media>
        <content.icon size={32} />
      </Empty.Media>
      <Empty.Title>{content.title}</Empty.Title>
      <Empty.Description>{content.description}</Empty.Description>
      <Empty.Action>
        <ButtonLink to="/" variant="primary" size="sm">
          Open Library
        </ButtonLink>
      </Empty.Action>
    </Empty.Root>
  );
}
