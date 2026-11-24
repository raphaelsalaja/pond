import {
  IconArrowDown,
  IconClock,
  IconClockPlus,
  IconFolderBan,
  IconFolderOpen,
  IconTagSlash,
  IconTrash,
} from "@pond/icons";
import { Button, Empty, EmptyPreview } from "@pond/ui";
import {
  importPaths,
  runNewAction,
} from "@/features/library/components/new-menu/actions";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import type { SaveListMode } from "@/features/saves";
import { openSources } from "@/features/sources";
import { ButtonLink } from "@/shared/components/button-link";
import { formatPlural } from "@/shared/lib/format";
import styles from "./styles.module.css";

export function LibraryEmpty() {
  return (
    <Empty.Root>
      <Empty.Media>
        <EmptyPreview.Root kind="tile" layout="spread">
          <EmptyPreview.Column>
            <EmptyPreview.Block />
            <EmptyPreview.Line width={36} />
            <EmptyPreview.Line width={24} tone="thin" />
          </EmptyPreview.Column>
        </EmptyPreview.Root>
      </Empty.Media>
      <Empty.Title>No Saves Yet</Empty.Title>
      <Empty.Description>
        Connect your first source to start building your library.
      </Empty.Description>
      <Empty.Action>
        <Button
          variant="secondary"
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
        <EmptyPreview.Root kind="tile" layout="single">
          <EmptyPreview.Column>
            <EmptyPreview.Block>
              <IconTrash size={12} />
            </EmptyPreview.Block>
            <EmptyPreview.Line width={32} />
          </EmptyPreview.Column>
        </EmptyPreview.Root>
      </Empty.Media>
      <Empty.Title>Trash Is Empty</Empty.Title>
      <Empty.Description>
        Deleted saves appear here until they are removed permanently.
      </Empty.Description>
      <Empty.Action>
        <ButtonLink to="/" variant="secondary" size="sm">
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
      <Empty.Title>Loading Library</Empty.Title>
      <Empty.Description>Getting your saves ready.</Empty.Description>
    </Empty.Root>
  );
}

export function UncategorizedEmpty() {
  return (
    <Empty.Root role="status" aria-live="polite">
      <Empty.Media>
        <EmptyPreview.Root kind="tile">
          <EmptyPreview.Column>
            <EmptyPreview.Block>
              <IconFolderBan size={12} />
            </EmptyPreview.Block>
            <EmptyPreview.Line width={36} />
            <EmptyPreview.Line width={22} tone="thin" />
          </EmptyPreview.Column>
        </EmptyPreview.Root>
      </Empty.Media>
      <Empty.Title>No Uncategorized Saves</Empty.Title>
      <Empty.Description>
        Saves that aren&apos;t in a folder appear here.
      </Empty.Description>
      <Empty.Action>
        <ButtonLink to="/" variant="secondary" size="sm">
          Open Library
        </ButtonLink>
      </Empty.Action>
    </Empty.Root>
  );
}

export function InboxEmpty() {
  const nav = useLibraryNav();
  if (nav?.kind === "inbox" && nav.snoozed) {
    return (
      <Empty.Root role="status" aria-live="polite">
        <Empty.Media>
          <EmptyPreview.Root>
            <EmptyPreview.Row>
              <EmptyPreview.Icon>
                <IconClock size={12} />
              </EmptyPreview.Icon>
              <EmptyPreview.Line width={46} />
              <EmptyPreview.Space />
              <EmptyPreview.Line width={24} tone="mid" />
            </EmptyPreview.Row>
          </EmptyPreview.Root>
        </Empty.Media>
        <Empty.Title>No Snoozed Saves</Empty.Title>
        <Empty.Description>
          Saves you snooze wait here, then return to the Inbox on time.
        </Empty.Description>
      </Empty.Root>
    );
  }
  return (
    <Empty.Root role="status" aria-live="polite">
      <Empty.Media>
        <EmptyPreview.Root kind="panel">
          <EmptyPreview.Column>
            <EmptyPreview.Block />
            <EmptyPreview.Line width={52} />
            <EmptyPreview.Line width={34} tone="thin" />
          </EmptyPreview.Column>
        </EmptyPreview.Root>
      </Empty.Media>
      <Empty.Title>You&apos;re All Caught Up</Empty.Title>
      <Empty.Description>
        New saves wait here until you process them.
      </Empty.Description>
    </Empty.Root>
  );
}

export function FolderEmpty({
  folderId,
  downloading = 0,
}: {
  folderId?: string;
  downloading?: number;
}) {
  if (downloading > 0) {
    return (
      <Empty.Root role="status" aria-live="polite">
        <Empty.Media>
          <EmptyPreview.Root layout="list">
            <EmptyPreview.Row>
              <EmptyPreview.Icon>
                <IconArrowDown size={12} />
              </EmptyPreview.Icon>
              <EmptyPreview.Line width={56} />
              <EmptyPreview.Space />
              <EmptyPreview.Line width={22} tone="light" />
            </EmptyPreview.Row>
          </EmptyPreview.Root>
        </Empty.Media>
        <Empty.Title>
          {`Downloading ${formatPlural(downloading, { one: "Save", other: "Saves" })}`}
        </Empty.Title>
        <Empty.Description>
          They appear in this folder as each download finishes.
        </Empty.Description>
        <Empty.Action>
          <ButtonLink to="/downloads" variant="secondary" size="sm">
            Open Downloads
          </ButtonLink>
        </Empty.Action>
      </Empty.Root>
    );
  }
  return (
    <Empty.Root role="status" aria-live="polite">
      <Empty.Media>
        <EmptyPreview.Root kind="tile" layout="spread">
          <EmptyPreview.Column>
            <EmptyPreview.Block>
              <IconFolderOpen size={12} />
            </EmptyPreview.Block>
            <EmptyPreview.Line width={34} />
          </EmptyPreview.Column>
        </EmptyPreview.Root>
      </Empty.Media>
      <Empty.Title>No Saves in This Folder</Empty.Title>
      <Empty.Description>
        Paste or drop files, images, and links here.
      </Empty.Description>
      {folderId ? (
        <Empty.Action>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              void runNewAction(() => importPaths("files", folderId))
            }
          >
            Add Files
          </Button>
        </Empty.Action>
      ) : null}
    </Empty.Root>
  );
}

type LibrarySection = Exclude<SaveListMode, "library" | "trash">;

export function LibrarySectionEmpty({ mode }: { mode: LibrarySection }) {
  const content =
    mode === "untagged"
      ? {
          visual: (
            <EmptyPreview.Root kind="tile">
              <EmptyPreview.Column>
                <EmptyPreview.Block>
                  <IconTagSlash size={12} />
                </EmptyPreview.Block>
                <EmptyPreview.Line width={30} />
                <EmptyPreview.Line width={20} tone="thin" />
              </EmptyPreview.Column>
            </EmptyPreview.Root>
          ),
          title: "No Untagged Saves",
          description: "Saves without tags appear here.",
        }
      : mode === "recents"
        ? {
            visual: (
              <EmptyPreview.Root layout="list">
                <EmptyPreview.Row>
                  <EmptyPreview.Thumb />
                  <EmptyPreview.Line width={46} />
                  <EmptyPreview.Space />
                  <EmptyPreview.Line width={24} tone="light" />
                </EmptyPreview.Row>
              </EmptyPreview.Root>
            ),
            title: "No Recent Saves",
            description: "Recently opened saves appear here.",
          }
        : {
            visual: (
              <EmptyPreview.Root kind="tile" layout="spread">
                <EmptyPreview.Column>
                  <EmptyPreview.Block>
                    <IconClockPlus size={12} />
                  </EmptyPreview.Block>
                  <EmptyPreview.Line width={38} />
                  <EmptyPreview.Line width={24} tone="thin" />
                </EmptyPreview.Column>
              </EmptyPreview.Root>
            ),
            title: "No New Saves",
            description: "Saves from the last 7 days appear here.",
          };

  return (
    <Empty.Root role="status" aria-live="polite">
      <Empty.Media>{content.visual}</Empty.Media>
      <Empty.Title>{content.title}</Empty.Title>
      <Empty.Description>{content.description}</Empty.Description>
      <Empty.Action>
        <ButtonLink to="/" variant="secondary" size="sm">
          Open Library
        </ButtonLink>
      </Empty.Action>
    </Empty.Root>
  );
}
