import { IconPlus, IconTag } from "@pond/icons";
import { Button } from "@pond/ui";
import type { FishRoutine, FishSummary } from "@shared/fish-contracts";
import { useEffect, useId, useRef, useState } from "react";
import { InspectorTextField } from "@/shared/components/inspector-text-field";
import type { InspectorDrafts } from "@/shared/components/inspector-text-field";
import { FolderIcon } from "@/shared/lib/folder-icons";
import { updateFish } from "../../lib/menu";
import { fish as fishStore, useFish, useFishEditingId } from "../../state/fish";
import { FishAppearance } from "./appearance";
import { FishPane } from "./pane";
import { RoutineList } from "./routine-list";
import { FishSelect } from "./select";
import styles from "./styles.module.css";

export interface FishProfileFolder {
  id: string;
  name: string;
  parentId?: string | null;
  color?: string | null;
}

interface FishProfileProps {
  fishId: string;
  folders: ReadonlyArray<FishProfileFolder>;
  tagNames: ReadonlyArray<string>;
  onClose: () => void;
  onNewRoutine?: () => void;
  onEditRoutine?: (routine: FishRoutine) => void;
}

export function FishProfile({
  fishId,
  folders,
  tagNames,
  onClose,
  onNewRoutine,
  onEditRoutine,
}: FishProfileProps) {
  const target = useFish(fishId);
  const [drafts] = useState<InspectorDrafts>(() => new Map());
  const editingId = useFishEditingId();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId !== fishId) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      nameRef.current?.focus();
      nameRef.current?.select();
      fishStore.finishEditing();
    });
    return () => cancelAnimationFrame(frame);
  }, [editingId, fishId]);

  if (!target) {
    return null;
  }
  return (
    <section className={styles.root} aria-label={target.name}>
      <FishPane.Header onClose={onClose} />
      <FishPane.Body>
        <div className={styles.hero}>
          <FishAppearance fish={target} />
          <InspectorTextField
            className={styles.name}
            inputRef={nameRef}
            drafts={drafts}
            cacheKey={`${target.id}:name`}
            label="Name"
            value={target.name}
            variant="borderless"
            appearance="bare"
            size="md"
            maxLength={40}
            commit={async (value) => {
              const name = value.trim();
              if (!name) {
                throw new Error("Give this fish a name.");
              }
              await fishStore.update(target.id, { name });
            }}
          />
        </div>
        <Details
          fish={target}
          drafts={drafts}
          onNewRoutine={onNewRoutine}
          onEditRoutine={onEditRoutine}
        />
        <Scope fish={target} folders={folders} tagNames={tagNames} />
      </FishPane.Body>
    </section>
  );
}

function Details({
  fish,
  drafts,
  onNewRoutine,
  onEditRoutine,
}: {
  fish: FishSummary;
  drafts: InspectorDrafts;
  onNewRoutine?: () => void;
  onEditRoutine?: (routine: FishRoutine) => void;
}) {
  const instructionsId = useId();
  const routinesId = useId();
  return (
    <>
      <section className={styles.note} aria-labelledby={instructionsId}>
        <h3 id={instructionsId} className={styles["note-title"]}>
          Instructions
        </h3>
        <InspectorTextField
          className={styles["note-field"]}
          drafts={drafts}
          cacheKey={`${fish.id}:instructions`}
          label="Instructions"
          value={fish.instructions}
          multiline
          variant="raised"
          padding="compact"
          maxLength={8000}
          placeholder="How it talks, what it cares about, and what it should never touch."
          commit={async (value) => {
            await fishStore.update(fish.id, { instructions: value.trim() });
          }}
        />
      </section>
      <section className={styles.note} aria-labelledby={routinesId}>
        <div className={styles["section-header"]}>
          <h3 id={routinesId} className={styles["note-title"]}>
            Routines
          </h3>
          {onNewRoutine ? (
            <Button
              icon
              variant="ghost"
              size="xs"
              aria-label="New Routine"
              onClick={onNewRoutine}
            >
              <IconPlus />
            </Button>
          ) : null}
        </div>
        <RoutineList fish={fish} onEditRoutine={onEditRoutine} />
      </section>
    </>
  );
}

function Scope({
  fish,
  folders,
  tagNames,
}: {
  fish: FishSummary;
  folders: ReadonlyArray<FishProfileFolder>;
  tagNames: ReadonlyArray<string>;
}) {
  const { folderIds, tags } = fish.scope;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const folderItems = folders.map((folder) => ({
    value: folder.id,
    label: folder.name,
    crumb: folder.parentId ? byId.get(folder.parentId)?.name : undefined,
    icon: <FolderIcon color={folder.color} />,
  }));
  const tagItems = [...new Set([...tagNames, ...tags])].map((tag) => ({
    value: tag,
    label: tag,
    icon: <IconTag />,
  }));

  return (
    <>
      <FishSelect.Field
        noun="Folder"
        value={folderIds}
        items={folderItems}
        onChange={(next) =>
          updateFish(fish, { scope: { folderIds: next, tags } })
        }
      />
      <FishSelect.Field
        noun="Tag"
        value={tags}
        items={tagItems}
        onChange={(next) =>
          updateFish(fish, { scope: { folderIds, tags: next } })
        }
      />
    </>
  );
}
