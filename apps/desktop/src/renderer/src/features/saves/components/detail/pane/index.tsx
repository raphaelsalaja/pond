import { IconBookmark, IconTriangleWarning, IconXmark } from "@pond/icons";
import { sensitiveContentBand } from "@pond/schema/content-safety";
import { Button, Empty, Pane, Tabs } from "@pond/ui";
import { mediaEmbeddingVersion } from "@shared/embeddings";
import { useEffect, useMemo, useState } from "react";
import { DISABLED_HINTS, TASK_ENABLED } from "@/features/enrichment";
import { ColorSwatch } from "@/features/saves/components/detail/color-swatch";
import { SaveInfoSections } from "@/features/saves/components/detail/info-sections";
import { KebabMenu } from "@/features/saves/components/detail/kebab";
import { RatingStars } from "@/features/saves/components/detail/rating";
import { RelatedSaves } from "@/features/saves/components/detail/related-saves";
import { useRetainedSaves, useSaves } from "@/features/saves/hooks/use-saves";
import { ensureSaves, reloadSaves } from "@/features/saves/lib/ensure-saves";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import { sensitiveContentMenuItem } from "@/features/saves/lib/menu/sensitive";
import { bulkMutation } from "@/features/saves/lib/mutate";
import { pool } from "@/features/saves/state/pool";
import { useSaveViewerFileIndex } from "@/features/saves/state/save-viewer";
import { useTagGroups, useTags } from "@/features/tags";
import { Section } from "@/shared/components/inspector-section";
import {
  type InspectorDrafts,
  InspectorTextField,
} from "@/shared/components/inspector-text-field";
import { PropertyList } from "@/shared/components/property-list";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { useStableStrings } from "@/shared/hooks/use-stable-array";
import { errorCopy } from "@/shared/lib/error-copy";
import { FolderIcon, type FolderIconId } from "@/shared/lib/folder-icons";
import { formatBytes } from "@/shared/lib/format";
import { getPrefsSnapshot } from "@/shared/state/prefs";
import { AssignMenu, type AssignOption } from "./assign-menu";
import { AssignmentChip } from "./chip";
import { EnrichedText } from "./enriched-text";
import { ratingMenu, SaveFacts } from "./facts";
import { SaveIdentity } from "./identity";
import { SaveNote } from "./note";
import { SavePreviews } from "./previews";
import { SourceCard } from "./source-card";
import styles from "./styles.module.css";
import { SuggestedTags } from "./suggested-tags";

export interface SaveInspectorProps {
  saveId: string;
  saveIds?: readonly string[];
  folders?: readonly {
    id: string;
    name: string;
    parentId?: string | null;
    count: number;
    icon?: FolderIconId;
    color?: string | null;
  }[];
}

type InspectorTab = "details" | "related";

type InspectorFolder = NonNullable<SaveInspectorProps["folders"]>[number];
const EMPTY_INSPECTOR_FOLDERS: readonly InspectorFolder[] = [];

interface FolderOption extends InspectorFolder {
  path: string;
}

function folderOptions(folders: readonly InspectorFolder[]): FolderOption[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path = (folder: InspectorFolder) => {
    const parts: string[] = [];
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const tags = useTags();
  const tagGroups = useTagGroups();
  const [failure, setFailure] = useState<{
    message: string;
    retry(): Promise<void>;
  } | null>(null);
  const fileIndex = useSaveViewerFileIndex();
  const [tab, setTab] = useState<InspectorTab>("details");
  const byId = new Map(available.map((save) => [save.id, save]));
  const saves = ids.flatMap((id) => {
    const save = byId.get(id);
    return save ? [save] : [];
  });
  const complete = saves.length === ids.length;
  const single = ids.length === 1 ? saves[0] : undefined;
  const indexed = single?.clipModel === mediaEmbeddingVersion();
  const activeTab: InspectorTab = single ? tab : "details";
  const folderEntries = useMemo(() => folderOptions(folders), [folders]);

  useEffect(() => {
    void attempt;
    let active = true;
    setLoadError(null);
    const targets = ids;
    void ensureSaves(targets)
      .then(() => {
        if (targets.some((id) => !pool.get(id)))
          throw new Error("A selected Save is no longer available.");
      })
      .catch((error: Error) => {
        if (active) setLoadError(error.message);
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
  for (const save of saves)
    for (const name of new Set(save.tags)) {
      const key = name.toLowerCase();
      const previous = tagCounts.get(key);
      tagCounts.set(key, {
        name: previous?.name ?? name,
        count: (previous?.count ?? 0) + 1,
      });
    }
  const applied = new Set(
    [...tagCounts]
      .filter(([, tag]) => tag.count === ids.length)
      .map(([key]) => key),
  );
  const tagGroupOf = new Map<string, string>();
  for (const group of tagGroups)
    for (const name of group.tagNames)
      if (!tagGroupOf.has(name.toLowerCase()))
        tagGroupOf.set(name.toLowerCase(), group.name);
  const tagNames = new Map<string, string>();
  for (const name of [
    ...tags.map((tag) => tag.name),
    ...[...tagCounts.values()].map((tag) => tag.name),
    ...(single?.suggestedTags ?? []),
  ])
    if (!tagNames.has(name.toLowerCase()))
      tagNames.set(name.toLowerCase(), name);
  const tagOptions: AssignOption[] = [...tagNames].map(([key, name]) => ({
    key,
    label: name,
    crumb: tagGroupOf.get(key),
    icon: <IconBookmark />,
    state: applied.has(key) ? "on" : tagCounts.has(key) ? "mixed" : "off",
  }));
  const suggestedTags = new Set(
    (single?.suggestedTags ?? []).map((name) => name.toLowerCase()),
  );
  const folderNames = new Map(
    folders.map((folder) => [folder.id, folder.name]),
  );
  const folderAssignOptions: AssignOption[] = folders.map((folder) => ({
    key: folder.id,
    label: folder.name,
    crumb: folder.parentId ? folderNames.get(folder.parentId) : undefined,
    icon: <FolderIcon name={folder.icon} color={folder.color} />,
    state:
      folder.count === ids.length ? "on" : folder.count > 0 ? "mixed" : "off",
  }));
  const pendingSuggestions = (single?.suggestedTags ?? []).filter(
    (name) => !applied.has(name.toLowerCase()),
  );
  const sensitivity = sensitiveContentBand(single?.sensitiveScore);
  async function applySuggestedTags() {
    await bulkMutation([...ids], { kind: "suggested-tags" });
    await reloadSaves([...ids]);
  }
  async function changeTag(name: string, remove = false) {
    const targets = [...ids];
    await bulkMutation(targets, {
      kind: "tags",
      tags: [name],
      mode: remove || applied.has(name.toLowerCase()) ? "remove" : "add",
    });
    await reloadSaves(targets);
  }

  async function assignFolder(folderId: string, add: boolean) {
    await window.pond.query("folders.assign", {
      saveIds: [...ids],
      addIds: add ? [folderId] : [],
      removeIds: add ? [] : [folderId],
    });
    if (add) saveLibraryBridge.rememberFolderDestinations([folderId]);
    await saveLibraryBridge.refreshFolders();
  }

  function createFolder(rawName: string) {
    const name = rawName.trim();
    let createdId: string | null = null;
    void run(async () => {
      if (!createdId)
        createdId = (await window.pond.query("folders.create", { name })).id;
      await assignFolder(createdId, true);
    });
  }

  function toggleFolder(option: InspectorFolder) {
    void run(() => assignFolder(option.id, option.count !== ids.length));
  }

  const details = (
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
      {complete ? (
        <>
          <SavePreviews saves={saves} />
          {single?.dominantColors?.length ? (
            <div className={styles.colors}>
              {single.dominantColors.slice(0, 8).map((color) => (
                <ColorSwatch
                  key={color}
                  color={color}
                  primaryColor={single.primaryColor ?? null}
                  saveId={single.id}
                />
              ))}
            </div>
          ) : null}
          {single &&
          (sensitivity === "likely-sensitive" ||
            sensitivity === "possible-sensitive") ? (
            <SpecContextMenu
              buildItems={() => [
                sensitiveContentMenuItem({
                  ids: [single.id],
                  saves: [single],
                  allTrashed: single.deletedAt != null,
                }),
              ]}
            >
              <p className={styles.flag} data-band={sensitivity}>
                <IconTriangleWarning size={14} aria-hidden />
                {sensitivity === "likely-sensitive"
                  ? "Likely sensitive content"
                  : "Possibly sensitive content"}
              </p>
            </SpecContextMenu>
          ) : null}
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
          {single ? (
            <SourceCard save={single} />
          ) : (
            <Section title="Description">
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
            </Section>
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
          <Section
            title="Tags"
            empty={tagCounts.size === 0}
            action={
              <AssignMenu
                noun="Tag"
                options={tagOptions}
                suggested={suggestedTags}
                onToggle={(option) => void run(() => changeTag(option.label))}
                onCreate={(name) => void run(() => changeTag(name))}
              />
            }
          >
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
          </Section>
          <SuggestedTags
            names={pendingSuggestions}
            onAdd={(name) => void run(() => changeTag(name))}
            onAddAll={() => void run(applySuggestedTags)}
          />
          <Section
            title="Folders"
            empty={!folders.some((folder) => folder.count > 0)}
            action={
              <AssignMenu
                noun="Folder"
                options={folderAssignOptions}
                onToggle={(option) => {
                  const folder = folders.find(({ id }) => id === option.key);
                  if (folder) toggleFolder(folder);
                }}
                onCreate={createFolder}
              />
            }
          >
            <AssignmentChip.List>
              {folderEntries
                .filter((folder) => folder.count > 0)
                .map((folder) => (
                  <AssignmentChip.Item
                    key={folder.id}
                    label={folder.name}
                    crumb={
                      folder.parentId
                        ? folderNames.get(folder.parentId)
                        : undefined
                    }
                    title={folder.path}
                    count={folder.count}
                    total={ids.length}
                    removeLabel={`Remove folder ${folder.path}`}
                    onRemove={() =>
                      void run(() => assignFolder(folder.id, false))
                    }
                  />
                ))}
            </AssignmentChip.List>
          </Section>
          {single?.caption?.trim() ? (
            <EnrichedText title="Caption" text={single.caption} />
          ) : null}
          {single?.ocrText?.trim() ? (
            <EnrichedText title="Text in Images" text={single.ocrText} />
          ) : null}
          {single?.transcript?.trim() ? (
            <EnrichedText title="Transcript" text={single.transcript} />
          ) : null}
          {single ? (
            <SaveInfoSections
              save={single}
              hideCoreProperties
              omitFileAndDates
              propertiesLead={
                <>
                  <SpecContextMenu
                    buildItems={() => ratingMenu(rating ?? 0, setRating)}
                  >
                    <PropertyList.Row>
                      <PropertyList.Label>Rating</PropertyList.Label>
                      <div className={styles.rating}>
                        <RatingStars value={rating} onChange={setRating} />
                      </div>
                    </PropertyList.Row>
                  </SpecContextMenu>
                  <SaveFacts save={single} />
                </>
              }
            />
          ) : (
            <Section title="Properties">
              <PropertyList.Root layout="grid">
                <PropertyList.Row>
                  <PropertyList.Label>Size</PropertyList.Label>
                  <PropertyList.Value>
                    {formatBytes(
                      saves.reduce(
                        (total, save) =>
                          total +
                          (save.fileSize ??
                            save.files.reduce(
                              (sum, file) => sum + file.size,
                              0,
                            )),
                        0,
                      ),
                    )}
                  </PropertyList.Value>
                </PropertyList.Row>
                <PropertyList.Row>
                  <PropertyList.Label>Rating</PropertyList.Label>
                  <div className={styles.rating}>
                    <RatingStars
                      value={rating}
                      onChange={(next) =>
                        void run(async () => {
                          await bulkMutation([...ids], {
                            kind: "rating",
                            rating: next,
                          });
                        })
                      }
                    />
                    {rating === null ? (
                      <span className={styles.muted}>Multiple ratings</span>
                    ) : null}
                  </div>
                </PropertyList.Row>
              </PropertyList.Root>
            </Section>
          )}
        </>
      ) : null}
    </>
  );

  return (
    <Tabs.Root
      render={
        <section
          className={styles.root}
          data-save-inspector={saveId}
          aria-label="Details"
        />
      }
      value={activeTab}
      onValueChange={(value: InspectorTab) => setTab(value)}
    >
      <Pane.Header
        className={styles.header}
        title={
          single ? (
            <Tabs.List aria-label="Details Views">
              <Tabs.Tab value="details">Details</Tabs.Tab>
              <Tabs.Tab value="related">Related</Tabs.Tab>
            </Tabs.List>
          ) : (
            "Details"
          )
        }
      >
        {single ? <KebabMenu save={single} fileIndex={fileIndex} /> : null}
        <Button
          type="button"
          icon
          size="sm"
          variant="ghost"
          aria-label="Close Details"
          onClick={saveLibraryBridge.closeDetails}
        >
          <IconXmark />
        </Button>
      </Pane.Header>
      {single ? (
        <>
          <Tabs.Panel value="details" className={styles.panel}>
            <Pane.Body className={styles.scroll} data-scroll-fade="vertical">
              {details}
            </Pane.Body>
          </Tabs.Panel>
          <Tabs.Panel value="related" className={styles.panel}>
            <Pane.Body className={styles.scroll} data-scroll-fade="vertical">
              {indexed ? (
                <RelatedSaves saveId={single.id} />
              ) : (
                <Empty.Root role="status">
                  <Empty.Title>Not indexed yet</Empty.Title>
                  <Empty.Description>
                    {TASK_ENABLED.clip(getPrefsSnapshot())
                      ? "Related saves appear once Visual Similarity indexes this save."
                      : DISABLED_HINTS.clip}
                  </Empty.Description>
                </Empty.Root>
              )}
            </Pane.Body>
          </Tabs.Panel>
        </>
      ) : (
        <Pane.Body className={styles.scroll} data-scroll-fade="vertical">
          {details}
        </Pane.Body>
      )}
    </Tabs.Root>
  );
}
