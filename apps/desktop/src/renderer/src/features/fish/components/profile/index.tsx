import { IconXmark } from "@pond/icons";
import { Button, Pane, Tabs } from "@pond/ui";
import type { FishRoutine, FishSummary } from "@shared/fish-contracts";
import { useEffect, useRef, useState } from "react";
import { Section } from "@/shared/components/inspector-section";
import {
  type InspectorDrafts,
  InspectorTextField,
} from "@/shared/components/inspector-text-field";
import { ModelPicker } from "@/shared/components/model-picker";
import { updateFish } from "../../lib/menu";
import {
  fish as fishStore,
  useFish,
  useFishEditingId,
  useOpenRoutineId,
} from "../../state/fish";
import { FishActivity } from "./activity";
import { FishAppearance } from "./appearance";
import { RoutineList } from "./routine-list";
import { RoutineView } from "./routine-view";
import { FishSelect } from "./select";
import styles from "./styles.module.css";

export interface FishProfileFolder {
  id: string;
  name: string;
}

interface FishProfileProps {
  fishId: string;
  folders: ReadonlyArray<FishProfileFolder>;
  tagNames: ReadonlyArray<string>;
  onClose: () => void;
  onEditRoutine?: (routine: FishRoutine) => void;
  onOpenChat?: (chatId: string) => void;
}

export function FishProfile({
  fishId,
  folders,
  tagNames,
  onClose,
  onEditRoutine,
  onOpenChat,
}: FishProfileProps) {
  const target = useFish(fishId);
  const openRoutineId = useOpenRoutineId(fishId);
  const [drafts] = useState<InspectorDrafts>(() => new Map());
  const editingId = useFishEditingId();
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (editingId !== fishId) return;
    const frame = requestAnimationFrame(() => {
      const name = rootRef.current?.querySelector<HTMLInputElement>(
        'input[aria-label="Name"]',
      );
      name?.focus();
      name?.select();
      fishStore.finishEditing();
    });
    return () => cancelAnimationFrame(frame);
  }, [editingId, fishId]);

  if (!target) return null;
  const openRoutine = target.routines.find(
    (routine) => routine.id === openRoutineId,
  );
  if (openRoutine)
    return (
      <section className={styles.root} aria-label={openRoutine.name}>
        <RoutineView
          fish={target}
          routine={openRoutine}
          onBack={() => fishStore.closeRoutine()}
          onClose={onClose}
          onEdit={onEditRoutine}
        />
      </section>
    );

  return (
    <Tabs.Root
      render={
        <section
          ref={rootRef}
          className={styles.root}
          aria-label={target.name}
        />
      }
      defaultValue="details"
    >
      <Pane.Header className={styles.header} title={null}>
        <Button
          type="button"
          icon
          size="sm"
          variant="ghost"
          aria-label="Close Details"
          onClick={onClose}
        >
          <IconXmark />
        </Button>
      </Pane.Header>
      <div className={styles.hero}>
        <FishAppearance fish={target} />
        <InspectorTextField
          className={styles.name}
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
            if (!name) throw new Error("Give this fish a name.");
            await fishStore.update(target.id, { name });
          }}
        />
      </div>
      <Tabs.List className={styles.tabs} aria-label="Fish Views">
        <Tabs.Tab value="details">Details</Tabs.Tab>
        <Tabs.Tab value="library">Library</Tabs.Tab>
        <Tabs.Tab value="activity">Activity</Tabs.Tab>
      </Tabs.List>
      <div className={styles.panels}>
        <Tabs.Panel value="details" className={styles.panel}>
          <Pane.Body className={styles.scroll} data-scroll-fade="vertical">
            <Details fish={target} drafts={drafts} />
          </Pane.Body>
        </Tabs.Panel>
        <Tabs.Panel value="library" className={styles.panel}>
          <Pane.Body className={styles.scroll} data-scroll-fade="vertical">
            <Scope fish={target} folders={folders} tagNames={tagNames} />
          </Pane.Body>
        </Tabs.Panel>
        <Tabs.Panel value="activity" className={styles.panel}>
          <Pane.Body className={styles.scroll} data-scroll-fade="vertical">
            <FishActivity
              fish={target}
              sectionClassName={styles.section}
              onOpenChat={onOpenChat}
            />
          </Pane.Body>
        </Tabs.Panel>
      </div>
    </Tabs.Root>
  );
}

function Details({
  fish,
  drafts,
}: {
  fish: FishSummary;
  drafts: InspectorDrafts;
}) {
  return (
    <>
      <Section
        title="Instructions"
        className={styles.section}
        collapsible={false}
      >
        <InspectorTextField
          drafts={drafts}
          cacheKey={`${fish.id}:instructions`}
          label="Instructions"
          value={fish.instructions}
          multiline
          clamp={6}
          maxLength={8000}
          placeholder="How it talks, what it cares about, and what it should never touch."
          commit={async (value) => {
            await fishStore.update(fish.id, { instructions: value.trim() });
          }}
        />
      </Section>
      <Section
        title="Model"
        className={styles.section}
        collapsible={false}
      >
        <ModelPicker
          layout="field"
          provider={fish.model?.provider ?? ""}
          modelId={fish.model?.modelId}
          onChange={(model) => updateFish(fish, { model })}
          onUseDefault={() => updateFish(fish, { model: null })}
        />
      </Section>
      <Section
        title="Routines"
        className={styles.section}
        collapsible={false}
      >
        <RoutineList fish={fish} />
      </Section>
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
  const folderItems = folders.map((folder) => ({
    value: folder.id,
    label: folder.name,
  }));
  const tagItems = [...new Set([...tagNames, ...tags])].map((tag) => ({
    value: tag,
    label: tag,
  }));

  return (
    <Section
      title="Reads"
      className={styles.section}
      collapsible={false}
    >
      <div className={styles.fields}>
        <FishSelect.Multi
          label="Folders"
          empty="Any Folder"
          value={folderIds}
          items={folderItems}
          onChange={(next) =>
            updateFish(fish, { scope: { folderIds: next, tags } })
          }
        />
        <FishSelect.Multi
          label="Tags"
          empty="Any Tag"
          value={tags}
          items={tagItems}
          onChange={(next) =>
            updateFish(fish, { scope: { folderIds, tags: next } })
          }
        />
      </div>
    </Section>
  );
}
