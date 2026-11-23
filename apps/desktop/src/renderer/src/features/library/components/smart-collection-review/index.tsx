import { Button, Dialog, Field, Input } from "@pond/ui";
import type { SavesReadQueryResults } from "@shared/saves-read-contracts";
import { useSelector } from "@tanstack/react-store";
import { useEffect, useMemo, useRef, useState } from "react";
import { folders } from "@/features/library/state/folders";
import {
  closeOrganizationReview,
  organizationReview,
} from "@/features/library/state/organization-review";
import { useRetainedDialogPayload } from "@/shared/hooks/use-retained-dialog-payload";
import { errorCopy } from "@/shared/lib/error-copy";
import { formatNumber } from "@/shared/lib/format";
import styles from "./styles.module.css";

type Cluster =
  SavesReadQueryResults["saves.semanticClusters"]["clusters"][number];
type Classification = SavesReadQueryResults["saves.classifyLabels"];

interface SmartCollectionReviewProps {
  scopeIds: string[] | null;
  onClose: () => void;
  open?: boolean;
}

export function OrganizationReviewHost() {
  const request = useSelector(organizationReview, (value) => value);
  const presentation = useRetainedDialogPayload(request);
  return presentation.payload ? (
    <SmartCollectionReview
      key={presentation.payload.id}
      scopeIds={presentation.payload.ids}
      onClose={closeOrganizationReview}
      open={presentation.open}
    />
  ) : null;
}

function proposedName(cluster: Cluster): string {
  return cluster.labels[0]?.trim() || "Related Saves";
}

export function SmartCollectionReview({
  scopeIds,
  onClose,
  open = true,
}: SmartCollectionReviewProps) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [unclustered, setUnclustered] = useState<string[]>([]);
  const [previewIds, setPreviewIds] = useState<string[]>([]);
  const [representatives, setRepresentatives] = useState(
    new Map<string, string>(),
  );
  const [index, setIndex] = useState(0);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [labelsText, setLabelsText] = useState("");
  const [nameInvalid, setNameInvalid] = useState(false);
  const [labelsInvalid, setLabelsInvalid] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const labelsField = useRef<HTMLInputElement>(null);
  const [classification, setClassification] = useState<Classification | null>(
    null,
  );
  const cluster = clusters[index];
  const [namedCluster, setNamedCluster] = useState(cluster);
  if (cluster !== namedCluster) {
    setNamedCluster(cluster);
    setName(cluster ? proposedName(cluster) : "");
    setNameInvalid(false);
  }
  const previewFailed =
    error !== null && clusters.length === 0 && unclustered.length === 0;

  useEffect(() => {
    let active = true;
    const limit = Math.max(3, Math.min(2_000, scopeIds?.length ?? 2_000));
    void window.pond
      .query("saves.semanticClusters", {
        saveIds: scopeIds ?? undefined,
        distance: 0.18,
        limit,
      })
      .then(async (preview) => {
        if (!active) return;
        setClusters(preview.clusters);
        setUnclustered(preview.unclustered);
        setPreviewIds([
          ...new Set([
            ...preview.clusters.flatMap((item) => item.memberIds),
            ...preview.unclustered,
          ]),
        ]);
        const representativeIds = preview.clusters.flatMap((item) =>
          item.memberIds.slice(0, 3),
        );
        if (representativeIds.length > 0) {
          const saves = await window.pond.query("saves.getMany", {
            ids: representativeIds,
          });
          if (!active) return;
          setRepresentatives(
            new Map(saves.map((save) => [save.id, save.title || save.id])),
          );
        }
        setLoading(false);
      })
      .catch((reason) => {
        if (!active) return;
        setError(
          errorCopy(reason, "Couldn't preview organization. Try again."),
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scopeIds]);

  const representativeRows = useMemo(
    () =>
      (cluster?.memberIds.slice(0, 3) ?? []).map((id) => ({
        id,
        title: representatives.get(id) ?? id,
      })),
    [cluster, representatives],
  );
  const classificationSummary = useMemo(() => {
    if (!classification) return [];
    const summaries = new Map<
      string,
      { label: string; count: number; totalScore: number }
    >();
    for (const item of classification.items) {
      const top = item.scores[0];
      if (!top) continue;
      const current = summaries.get(top.label) ?? {
        label: top.label,
        count: 0,
        totalScore: 0,
      };
      current.count += 1;
      current.totalScore += top.score;
      summaries.set(top.label, current);
    }
    return [...summaries.values()].sort(
      (left, right) =>
        right.totalScore / right.count - left.totalScore / left.count ||
        left.label.localeCompare(right.label),
    );
  }, [classification]);

  function skip(): void {
    setClusters((current) => current.filter((_, item) => item !== index));
    setIndex(0);
  }

  async function createFolder(): Promise<void> {
    if (!cluster) return;
    if (!name.trim()) {
      setNameInvalid(true);
      nameField.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await window.pond.query("folders.createWithSaves", {
        name: name.trim(),
        parentId: null,
        saveIds: cluster.memberIds,
      });
      skip();
      await folders.refresh();
    } catch (reason) {
      setError(errorCopy(reason, "Couldn't create the folder. Try again."));
    } finally {
      setBusy(false);
    }
  }

  function classificationIds(): string[] {
    return [...new Set(scopeIds ?? previewIds)].slice(0, 2_000);
  }

  function classificationLabels(): string[] {
    return [
      ...new Set(
        labelsText
          .split(/[,\n]/)
          .map((label) => label.replace(/\s+/g, " ").trim())
          .filter(Boolean),
      ),
    ].slice(0, 50);
  }

  async function previewLabels(): Promise<void> {
    const saveIds = classificationIds();
    const labels = classificationLabels();
    if (labels.length === 0) {
      setLabelsInvalid(true);
      labelsField.current?.focus();
      return;
    }
    if (saveIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      setClassification(
        await window.pond.query("saves.classifyLabels", { saveIds, labels }),
      );
    } catch (reason) {
      setError(errorCopy(reason, "Couldn't preview labels. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function applyLabels(): Promise<void> {
    if (!classification) return;
    const assignments = new Map<string, string[]>();
    for (const item of classification.items) {
      const label = item.scores[0]?.label;
      if (!label) continue;
      const ids = assignments.get(label) ?? [];
      ids.push(item.id);
      assignments.set(label, ids);
    }
    setBusy(true);
    setError(null);
    try {
      for (const [label, ids] of assignments) {
        await window.pond.query("saves.bulkEdit", {
          ids,
          actorReason: "semantic-label-preview",
          operation: { kind: "tags", tags: [label], mode: "add" },
        });
      }
      setClassification(null);
    } catch (reason) {
      setError(errorCopy(reason, "Couldn't apply labels. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(open, details) => {
        if (busy) details.cancel();
        else if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Header>
            <Dialog.Title>Review Organization</Dialog.Title>
          </Dialog.Header>
          <Dialog.Description>
            Preview suggestions before Pond creates folders or adds tags.
          </Dialog.Description>
          <Dialog.Content className={styles.content}>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            {loading ? (
              <p className={styles.meta} role="status">
                Finding related Saves
              </p>
            ) : (
              <>
                {previewFailed ? null : (
                  <section className={styles.section}>
                    <header className={styles.heading}>
                      <h3>Suggested Folders</h3>
                      {cluster ? (
                        <span className={styles.meta}>
                          {index + 1} of {clusters.length}
                        </span>
                      ) : null}
                    </header>
                    {cluster ? (
                      <>
                        <Field.Root
                          className={styles.field}
                          invalid={nameInvalid || undefined}
                        >
                          <Field.Label>Folder Name</Field.Label>
                          <Input.Root>
                            <Field.Control
                              ref={nameField}
                              render={<Input.Field />}
                              value={name}
                              onValueChange={(value) => {
                                setName(value);
                                if (value.trim()) setNameInvalid(false);
                              }}
                              disabled={busy}
                            />
                          </Input.Root>
                          {nameInvalid ? (
                            <Field.Error match>Name the folder.</Field.Error>
                          ) : null}
                        </Field.Root>
                        <div className={styles.members}>
                          <p className={styles.meta}>
                            {formatNumber(cluster.memberIds.length)} Saves,
                            including
                          </p>
                          <ul className={styles.representatives}>
                            {representativeRows.map(({ id, title }) => (
                              <li key={id}>{title}</li>
                            ))}
                          </ul>
                        </div>
                        <div className={styles.actions}>
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={skip}
                          >
                            Skip
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void createFolder()}
                          >
                            Create Folder
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className={styles.meta}>
                        No more folder suggestions for these Saves.
                      </p>
                    )}
                    {unclustered.length > 0 ? (
                      <p className={styles.meta}>
                        {formatNumber(unclustered.length)}{" "}
                        {unclustered.length === 1
                          ? "Save didn't fit a suggestion."
                          : "Saves didn't fit a suggestion."}
                      </p>
                    ) : null}
                  </section>
                )}
                <section className={styles.section}>
                  <header className={styles.heading}>
                    <h3>Tag by Label</h3>
                  </header>
                  <Field.Root
                    className={styles.field}
                    invalid={labelsInvalid || undefined}
                  >
                    <Field.Label>Labels</Field.Label>
                    <Input.Root>
                      <Field.Control
                        ref={labelsField}
                        render={<Input.Field />}
                        placeholder="Posters, Logos, Interiors"
                        value={labelsText}
                        onValueChange={(value) => {
                          setLabelsText(value);
                          setClassification(null);
                          setLabelsInvalid(false);
                        }}
                        disabled={busy}
                      />
                    </Input.Root>
                    {labelsInvalid ? (
                      <Field.Error match>Add at least one label.</Field.Error>
                    ) : (
                      <Field.Description>
                        Separate labels with commas. Applying adds the best
                        match as a tag and keeps existing tags.
                      </Field.Description>
                    )}
                  </Field.Root>
                  {classification ? (
                    <>
                      <ul className={styles.scores}>
                        {classificationSummary.map((summary) => (
                          <li key={summary.label}>
                            {summary.label}: {formatNumber(summary.count)}{" "}
                            Saves,{" "}
                            {Math.round(
                              (summary.totalScore / summary.count) * 100,
                            )}
                            % average match
                          </li>
                        ))}
                      </ul>
                      {classification.excludedIds.length > 0 ? (
                        <p className={styles.meta}>
                          {formatNumber(classification.excludedIds.length)}{" "}
                          Saves skipped because they haven't been analyzed yet.
                        </p>
                      ) : null}
                    </>
                  ) : null}
                  <div className={styles.actions}>
                    {classification ? (
                      <Button
                        variant="secondary"
                        disabled={busy || classification.items.length === 0}
                        onClick={() => void applyLabels()}
                      >
                        Apply Labels
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={busy || classificationIds().length === 0}
                        onClick={() => void previewLabels()}
                      >
                        Preview Labels
                      </Button>
                    )}
                  </div>
                </section>
              </>
            )}
          </Dialog.Content>
          <Dialog.Footer>
            <Dialog.Cancel disabled={busy}>Done</Dialog.Cancel>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
