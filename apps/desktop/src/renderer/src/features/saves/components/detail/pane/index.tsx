import { IconCursor, IconScanImage, IconTag } from "@pond/icons";
import { Button, Empty, EmptyPreview, Pane, Tabs } from "@pond/ui";
import { mediaEmbeddingVersion } from "@shared/embeddings";
import { useEffect, useMemo, useState } from "react";
import { DISABLED_HINTS, TASK_ENABLED } from "@/features/enrichment";
import { KebabMenu } from "@/features/saves/components/detail/kebab";
import { RelatedSaves } from "@/features/saves/components/detail/related-saves";
import { useRetainedSaves, useSaves } from "@/features/saves/hooks/use-saves";
import { ensureSaves, reloadSaves } from "@/features/saves/lib/ensure-saves";
import { changeSaveFolders } from "@/features/saves/lib/folder-actions";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import type { SaveFolderReference } from "@/features/saves/lib/library-bridge";
import { bulkMutation } from "@/features/saves/lib/mutate";
import { loadRelated } from "@/features/saves/lib/related";
import { pool } from "@/features/saves/state/pool";
import {
  useSaveViewerFileIndex,
  useSaveViewerNavigation,
} from "@/features/saves/state/save-viewer";
import { useTagGroups, useTags } from "@/features/tags";
import { InspectorTextField } from "@/shared/components/inspector-text-field";
import type { InspectorDrafts } from "@/shared/components/inspector-text-field";
import { useStableStrings } from "@/shared/hooks/use-stable-array";
import { errorCopy } from "@/shared/lib/error-copy";
import { FolderIcon } from "@/shared/lib/folder-icons";
import type { FolderIconId } from "@/shared/lib/folder-icons";
import { getPrefsSnapshot } from "@/shared/state/prefs";
import { AssignMenu } from "./assign-menu";
import type { AssignOption } from "./assign-menu";
import { AssignmentChip } from "./chip";
import { DetailSection } from "./detail-section";
import { EnrichedText } from "./enriched-text";
import { FavoriteButton } from "./favorite";
import { FileSwitcher } from "./file-switcher";
import type { FilePager } from "./file-switcher";
import { SaveIdentity } from "./identity";
import { SaveNote } from "./note";
import { SavePreviews, stackCards } from "./previews";
import { SaveProperties } from "./properties";
import styles from "./styles.module.css";
export interface SaveInspectorProps {
  saveId: string;
  saveIds?: ReadonlyArray<string>;
  folders?: ReadonlyArray<{
    id: string;
    name: string;
    parentId?: string | null;
    count: number;
    icon?: FolderIconId;
    color?: string | null;
  }>;
}

type InspectorView = "details" | "related";

type InspectorFolder = NonNullable<SaveInspectorProps["folders"]>[number];
const EMPTY_INSPECTOR_FOLDERS: ReadonlyArray<InspectorFolder> = [];

interface FolderOption extends InspectorFolder {
  path: string;
}

function folderOptions(
  folders: ReadonlyArray<InspectorFolder>,
): Array<FolderOption> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path = (folder: InspectorFolder) => {
    const parts: Array<string> = [];
    const seen = new Set<string>();
    let current: InspectorFolder | undefined = folder;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      parts.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return parts.join(" / ");
  };
  return folders.map((folder) => ({ ...folder, path: path(folder) }));
}

export function EmptySaveInspector() {
  return (
    <section className={styles.root} aria-label="Details">
      <Empty.Root size="card" role="status">
        <Empty.Media>
          <EmptyPreview.Root kind="panel" layout="single">
            <EmptyPreview.Column>
              <EmptyPreview.Block height={44}>
                <IconCursor size={12} />
              </EmptyPreview.Block>
              <EmptyPreview.Line width={56} />
              <EmptyPreview.Line width={40} tone="thin" />
              <EmptyPreview.Line width={48} tone="thin" />
            </EmptyPreview.Column>
          </EmptyPreview.Root>
        </Empty.Media>
        <Empty.Title>Nothing Selected</Empty.Title>
        <Empty.Description>Select a save to see its details.</Empty.Description>
      </Empty.Root>
    </section>
  );
}

export function SaveInspector({
  saveId,
  saveIds,
  folders = EMPTY_INSPECTOR_FOLDERS,
}: SaveInspectorProps) {
  const ids = useStableStrings(saveIds?.length ? saveIds : [saveId]);
  const targetKey = JSON.stringify(ids);
  useRetainedSaves(ids);
  const available = useSaves();
  const [drafts] = useState<InspectorDrafts>(() => new Map());
  const [attempt, setAttempt] = useState(0);
  const [loadFailure, setLoadFailure] = useState<{
    ids: ReadonlyArray<string>;
    attempt: number;
    message: string;
  } | null>(null);
  const loadError =
    loadFailure?.ids === ids && loadFailure.attempt === attempt
      ? loadFailure.message
      : null;
  const tags = useTags();
  const tagGroups = useTagGroups();
  const [failure, setFailure] = useState<{
    message: string;
    retry: () => Promise<void>;
  } | null>(null);
  const fileIndex = useSaveViewerFileIndex();
  const [view, setView] = useState<InspectorView>("details");
  const byId = new Map(available.map((save) => [save.id, save]));
  const saves = ids.flatMap((id) => {
    const save = byId.get(id);
    return save ? [save] : [];
  });
  const complete = saves.length === ids.length;
  const single = ids.length === 1 ? saves[0] : undefined;
  const indexed = single?.clipModel === mediaEmbeddingVersion();
  const folderEntries = useMemo(() => folderOptions(folders), [folders]);
  const viewerNavigation = useSaveViewerNavigation();
  const viewing =
    single !== undefined && viewerNavigation?.saveId === single.id;
  const cards = single ? stackCards(single) : [];
  const [slide, setSlide] = useState({ saveId, index: 0 });
  const slideIndex =
    slide.saveId === saveId
      ? Math.min(slide.index, Math.max(cards.length - 1, 0))
      : 0;
  const pager: FilePager =
    viewing && viewerNavigation
      ? viewerNavigation
      : {
          index: slideIndex,
          count: cards.length,
          onPrevious: () =>
            setSlide({ saveId, index: Math.max(0, slideIndex - 1) }),
          onNext: () =>
            setSlide({
              saveId,
              index: Math.min(cards.length - 1, slideIndex + 1),
            }),
        };

  useEffect(() => {
    let active = true;
    const targets = ids;
    const fail = (message: string) => {
      if (active) {
        setLoadFailure({ ids: targets, attempt, message });
      }
    };
    void ensureSaves(targets)
      .then(() => {
        if (targets.some((id) => !pool.get(id))) {
          fail("A selected Save is no longer available.");
        }
      })
      .catch((cause: unknown) => {
        fail(errorCopy(cause, "Couldn't load the selected saves."));
      });
    return () => {
      active = false;
    };
  }, [ids, attempt]);

  async function run(action: () => Promise<void>) {
    setFailure(null);
    try {
      await action();
    } catch (error) {
      setFailure({
        message: errorCopy(error, "Couldn't update the selection."),
        retry: action,
      });
    }
  }
  const notes = saves.every((save) => save.notes === saves[0]?.notes)
    ? (saves[0]?.notes ?? "")
    : null;
  const rating = saves.every((save) => save.rating === saves[0]?.rating)
    ? (saves[0]?.rating ?? 0)
    : null;
  const setRating = (next: number) =>
    void run(async () => {
      await bulkMutation([...ids], { kind: "rating", rating: next });
    });
  const tagCounts = new Map<string, { name: string; count: number }>();
  for (const save of saves) {
    for (const name of new Set(save.tags)) {
      const key = name.toLowerCase();
      const previous = tagCounts.get(key);
      tagCounts.set(key, {
        name: previous?.name ?? name,
        count: (previous?.count ?? 0) + 1,
      });
    }
  }
  const applied = new Set(
    [...tagCounts].flatMap(([key, tag]) =>
      tag.count === ids.length ? [key] : [],
    ),
  );
  const tagGroupOf = new Map<string, string>();
  for (const group of tagGroups) {
    for (const name of group.tagNames) {
      if (!tagGroupOf.has(name.toLowerCase())) {
        tagGroupOf.set(name.toLowerCase(), group.name);
      }
    }
  }
  const tagNames = new Map<string, string>();
  for (const name of [
    ...tags.map((tag) => tag.name),
    ...[...tagCounts.values()].map((tag) => tag.name),
    ...(single?.suggestedTags ?? []),
  ]) {
    if (!tagNames.has(name.toLowerCase())) {
      tagNames.set(name.toLowerCase(), name);
    }
  }
  const tagOptions: Array<AssignOption> = [...tagNames].map(([key, name]) => ({
    key,
    label: name,
    crumb: tagGroupOf.get(key),
    icon: <IconTag />,
    state: applied.has(key) ? "on" : tagCounts.has(key) ? "mixed" : "off",
  }));
  const suggestedTags = new Set(
    (single?.suggestedTags ?? [])
      .map((name) => name.toLowerCase())
      .filter((key) => !applied.has(key)),
  );
  const folderNames = new Map(
    folders.map((folder) => [folder.id, folder.name]),
  );
  const folderAssignOptions: Array<AssignOption> = folders.map((folder) => ({
    key: folder.id,
    label: folder.name,
    crumb: folder.parentId ? folderNames.get(folder.parentId) : undefined,
    icon: <FolderIcon name={folder.icon} color={folder.color} />,
    state:
      folder.count === ids.length ? "on" : folder.count > 0 ? "mixed" : "off",
  }));
  async function changeTag(name: string, remove = false) {
    const targets = [...ids];
    await bulkMutation(targets, {
      kind: "tags",
      tags: [name],
      mode: remove || applied.has(name.toLowerCase()) ? "remove" : "add",
    });
    await reloadSaves(targets);
  }

  async function assignFolder(folder: SaveFolderReference, add: boolean) {
    await changeSaveFolders({
      saveIds: ids,
      add: add ? [folder] : [],
      remove: add ? [] : [folder],
    });
  }

  function createFolder(rawName: string) {
    const name = rawName.trim();
    let createdId: string | null = null;
    void run(async () => {
      const folderId =
        createdId ?? (await window.pond.query("folders.create", { name })).id;
      createdId = folderId;
      await assignFolder({ id: folderId, name }, true);
    });
  }

  function toggleFolder(option: InspectorFolder) {
    void run(() => assignFolder(option, option.count !== ids.length));
  }

  const tagMenu = (
    <AssignMenu
      noun="Tag"
      options={tagOptions}
      suggested={suggestedTags}
      onToggle={(option) => void run(() => changeTag(option.label))}
      onCreate={(name) => void run(() => changeTag(name))}
    />
  );

  const assignedFolders = folderEntries.filter((folder) => folder.count > 0);
  const folderMenu = (
    <AssignMenu
      noun="Folder"
      options={folderAssignOptions}
      onToggle={(option) => {
        const folder = folders.find(({ id }) => id === option.key);
        if (folder) {
          toggleFolder(folder);
        }
      }}
      onCreate={createFolder}
    />
  );

  const status = (
    <>
      {loadError ? (
        <div role="alert">
          {loadError}
          <Button onClick={() => setAttempt((value) => value + 1)}>
            Try Again
          </Button>
        </div>
      ) : !complete ? (
        <p role="status">Loading save details</p>
      ) : null}
      {failure ? (
        <div role="alert">
          {failure.message}
          <Button onClick={() => void run(failure.retry)}>Try Again</Button>
        </div>
      ) : null}
    </>
  );

  const media = (
    <>
      <SavePreviews
        saves={saves}
        fileIndex={fileIndex}
        activeKey={viewing ? null : (cards[slideIndex]?.key ?? null)}
      />
      {single ? <FileSwitcher pager={pager} shortcuts={viewing} /> : null}
      {!single ? (
        <p className={styles.count}>
          <strong>{ids.length}</strong> items selected
        </p>
      ) : null}
      <SaveIdentity
        key={targetKey}
        save={single}
        drafts={drafts}
        cacheKey={targetKey}
      />
    </>
  );

  const texts = single
    ? [
        { title: "Caption", text: single.caption },
        { title: "Detected Text", text: single.ocrText },
        { title: "Transcript", text: single.transcript },
      ].filter((entry): entry is { title: string; text: string } =>
        Boolean(entry.text?.trim()),
      )
    : [];

  const sections = (
    <div className={styles.sections}>
      {single ? null : (
        <DetailSection title="Description">
          <InspectorTextField
            className={styles.prose}
            drafts={drafts}
            cacheKey={`${targetKey}:description`}
            label="Description"
            value={null}
            multiline
            disabled
            variant="borderless"
            padding="compact"
            mixedPlaceholder="Multiple descriptions"
            commit={async () => {}}
          />
        </DetailSection>
      )}
      <SaveNote
        value={notes}
        drafts={drafts}
        cacheKey={`${targetKey}:notes`}
        commit={async (value) => {
          await bulkMutation([...ids], {
            kind: "notes",
            notes: value || null,
          });
        }}
      />
      <DetailSection title="Folders" action={folderMenu}>
        {assignedFolders.length ? (
          <AssignmentChip.List>
            {assignedFolders.map((folder) => (
              <AssignmentChip.Item
                key={folder.id}
                label={folder.name}
                crumb={
                  folder.parentId ? folderNames.get(folder.parentId) : undefined
                }
                title={folder.path}
                count={folder.count}
                total={ids.length}
                removeLabel={`Remove folder ${folder.path}`}
                onRemove={() => void run(() => assignFolder(folder, false))}
              />
            ))}
          </AssignmentChip.List>
        ) : (
          <Empty.Root size="inline" variant="dashed">
            <Empty.Description>No Folders Selected</Empty.Description>
          </Empty.Root>
        )}
      </DetailSection>
      <DetailSection title="Tags" action={tagMenu}>
        {tagCounts.size > 0 ? (
          <AssignmentChip.List>
            {[...tagCounts].map(([key, tag]) => (
              <AssignmentChip.Item
                key={key}
                label={tag.name}
                crumb={tagGroupOf.get(key)}
                count={tag.count}
                total={ids.length}
                removeLabel={`Remove tag ${tag.name}`}
                onRemove={() => void run(() => changeTag(tag.name, true))}
                onOpen={() => saveLibraryBridge.openTaggedItems(tag.name)}
              />
            ))}
          </AssignmentChip.List>
        ) : (
          <Empty.Root size="inline" variant="dashed">
            <Empty.Description>No Tags Selected</Empty.Description>
          </Empty.Root>
        )}
      </DetailSection>
      <SaveProperties saves={saves} rating={rating} onRate={setRating} />
      {texts.map((entry) => (
        <EnrichedText key={entry.title} title={entry.title} text={entry.text} />
      ))}
    </div>
  );

  const prefetchRelated = () => {
    if (single && indexed) {
      void loadRelated(single.id).catch(() => undefined);
    }
  };

  const related =
    single && indexed ? (
      <RelatedSaves saveId={single.id} />
    ) : (
      <Empty.Root size="card" role="status">
        <Empty.Media>
          <EmptyPreview.Root kind="tile" layout="spread">
            <EmptyPreview.Column>
              <EmptyPreview.Block>
                <IconScanImage size={12} />
              </EmptyPreview.Block>
              <EmptyPreview.Line width={32} />
            </EmptyPreview.Column>
          </EmptyPreview.Root>
        </Empty.Media>
        <Empty.Title>Not Indexed Yet</Empty.Title>
        <Empty.Description>
          {TASK_ENABLED.clip(getPrefsSnapshot())
            ? "Related saves appear once Visual Similarity indexes this save."
            : DISABLED_HINTS.clip}
        </Empty.Description>
      </Empty.Root>
    );

  const details = (
    <Pane.Body
      density="compact"
      className={styles.scroll}
      data-scroll-fade="vertical"
    >
      {status}
      {complete ? (
        <>
          {media}
          {sections}
        </>
      ) : null}
    </Pane.Body>
  );
  const actions = (
    <>
      <FavoriteButton saves={saves} />
      {single ? <KebabMenu save={single} fileIndex={fileIndex} /> : null}
    </>
  );

  if (!single) {
    return (
      <section
        className={styles.root}
        data-save-inspector={saveId}
        aria-label="Details"
      >
        <Pane.Header className={styles.header} title="Details">
          {actions}
        </Pane.Header>
        {details}
      </section>
    );
  }

  return (
    <Tabs.Root
      render={
        <section
          className={styles.root}
          data-save-inspector={saveId}
          aria-label="Details"
        />
      }
      value={view}
      onValueChange={(value: InspectorView) => setView(value)}
    >
      <Pane.Header
        className={styles.header}
        title={
          <Tabs.List variant="secondary" aria-label="Details Views">
            <Tabs.Tab value="details">Details</Tabs.Tab>
            <Tabs.Tab
              value="related"
              onPointerEnter={prefetchRelated}
              onFocus={prefetchRelated}
            >
              Related
            </Tabs.Tab>
          </Tabs.List>
        }
      >
        {actions}
      </Pane.Header>
      <Tabs.Panel value="details" keepMounted className={styles.panel}>
        {details}
      </Tabs.Panel>
      <Tabs.Panel value="related" className={styles.panel}>
        <Pane.Body
          density="compact"
          className={styles.scroll}
          data-scroll-fade="vertical"
        >
          {related}
        </Pane.Body>
      </Tabs.Panel>
    </Tabs.Root>
  );
}
