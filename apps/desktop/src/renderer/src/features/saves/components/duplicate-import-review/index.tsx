import { Badge, Button, Checkbox, Dialog, Toggle, ToggleGroup } from "@pond/ui";
import type {
  DuplicateImportCandidate,
  DuplicateImportChoice,
} from "@shared/saves-import-contracts";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { CardThumb } from "@/features/saves/components/card/media";
import { useSave } from "@/features/saves/hooks/use-saves";
import { ensureSaves } from "@/features/saves/lib/ensure-saves";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import { pickPrimaryFile } from "@/features/saves/lib/media/units";
import {
  closeDuplicateImportReview,
  completeDuplicateImportReview,
  useDuplicateImportReview,
} from "@/features/saves/state/duplicate-import-review";
import type { Save } from "@/features/saves/types";
import { useRetainedDialogPayload } from "@/shared/hooks/use-retained-dialog-payload";
import { formatBytes } from "@/shared/lib/format";
import styles from "./styles.module.css";

export function DuplicateImportReviewHost() {
  const request = useDuplicateImportReview();
  const presentation = useRetainedDialogPayload(request);
  return presentation.payload ? (
    <DuplicateImportReview
      key={presentation.payload.id}
      open={presentation.open}
      candidates={presentation.payload.candidates}
    />
  ) : null;
}

function parentFolder(path: string) {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return { name: parts.at(-1) ?? null, path: parts.join("/") };
}

function describe(save: Save | undefined) {
  const file = save ? pickPrimaryFile(save) : null;
  if (!file) return null;
  return [
    file.width && file.height ? `${file.width} × ${file.height}` : null,
    file.size ? formatBytes(file.size) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Side({
  label,
  tone,
  save,
  name,
  meta,
  places,
}: {
  label: string;
  tone: "existing" | "new";
  save: Save | undefined;
  name: string;
  meta: string | null;
  places: ReactNode;
}) {
  return (
    <figure className={styles.side} data-tone={tone}>
      <div className={styles.frame}>
        {save ? <CardThumb save={save} width={320} /> : null}
        <Badge
          className={styles.label}
          tone={tone === "existing" ? "inverted" : "neutral"}
        >
          {label}
        </Badge>
      </div>
      <figcaption className={styles.caption}>
        <span className={styles.name} title={name}>
          {name}
        </span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
        <span className={styles.places}>{places}</span>
      </figcaption>
    </figure>
  );
}

function DuplicateImportReview({
  open,
  candidates,
}: {
  open: boolean;
  candidates: DuplicateImportCandidate[];
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const applyId = useId();
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<DuplicateImportChoice>("use-existing");
  const [applyToAll, setApplyToAll] = useState(false);
  const [decisions, setDecisions] = useState<
    Record<string, DuplicateImportChoice>
  >({});
  const candidate = candidates[index];
  const existingId = candidate?.existingId;
  const save = useSave(existingId);
  useEffect(() => {
    if (existingId) void ensureSaves([existingId]);
  }, [existingId]);

  if (!candidate) return null;
  const remaining = candidates.length - index;
  const last = applyToAll || remaining === 1;
  const existingName =
    candidate.existingTitle?.trim() || save?.title || candidate.filename;
  const existingFolders = saveLibraryBridge.foldersForSave(
    candidate.existingId,
  );
  const source = parentFolder(candidate.path);
  const meta = describe(save);

  const submit = () => {
    const next = { ...decisions };
    for (const item of applyToAll ? candidates.slice(index) : [candidate])
      next[item.path] = choice;
    if (last) {
      completeDuplicateImportReview(next);
      return;
    }
    setDecisions(next);
    setIndex((current) => current + 1);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(open) => {
        if (!open) closeDuplicateImportReview();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup} initialFocus={confirmRef}>
          <Dialog.Header>
            <Dialog.Title>Duplicate File</Dialog.Title>
            {candidates.length > 1 ? (
              <span className={styles.count}>
                {index + 1} of {candidates.length}
              </span>
            ) : null}
          </Dialog.Header>
          <Dialog.Content className={styles.content}>
            <Dialog.Description>
              This file is already in your Library.
            </Dialog.Description>
            <div className={styles.compare}>
              <Side
                label="Existing"
                tone="existing"
                save={save}
                name={existingName}
                meta={meta}
                places={
                  existingFolders.length > 0 ? (
                    existingFolders.map((folder) => (
                      <Badge key={folder.id}>{folder.name}</Badge>
                    ))
                  ) : (
                    <Badge>Uncategorized</Badge>
                  )
                }
              />
              <Side
                label="New"
                tone="new"
                save={save}
                name={candidate.filename}
                meta={meta}
                places={
                  source.name ? (
                    <Badge title={`/${source.path}`}>{source.name}</Badge>
                  ) : null
                }
              />
            </div>
          </Dialog.Content>
          <Dialog.Footer
            leading={
              <div className={styles.choices}>
                <ToggleGroup
                  aria-label="Duplicate choice"
                  value={[choice]}
                  onValueChange={(value) => {
                    const next = value[0];
                    if (next === "use-existing" || next === "keep-both")
                      setChoice(next);
                  }}
                >
                  <Toggle type="button" size="sm" value="use-existing">
                    Use Existing
                  </Toggle>
                  <Toggle type="button" size="sm" value="keep-both">
                    Keep Both
                  </Toggle>
                </ToggleGroup>
                {remaining > 1 ? (
                  <label className={styles.apply} htmlFor={applyId}>
                    <Checkbox.Root
                      id={applyId}
                      checked={applyToAll}
                      onCheckedChange={(checked) =>
                        setApplyToAll(checked === true)
                      }
                    >
                      <Checkbox.Indicator />
                    </Checkbox.Root>
                    <span>{`Apply to All (${remaining})`}</span>
                  </label>
                ) : null}
              </div>
            }
          >
            <Dialog.Cancel />
            <Button ref={confirmRef} onClick={submit}>
              {last ? "Import" : "Next"}
            </Button>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
