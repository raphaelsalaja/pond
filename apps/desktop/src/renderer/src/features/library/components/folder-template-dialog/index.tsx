import type { FolderTemplate } from "@pond/schema/folder-templates";
import {
  Button,
  Checkbox,
  Dialog,
  Field,
  Input,
  Toggle,
  ToggleGroup,
} from "@pond/ui";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  closeFolderTemplateDialog,
  useFolderTemplateDialog,
} from "@/features/library/state/folder-template-dialog";
import type { FolderTemplateDialogState } from "@/features/library/state/folder-template-dialog";
import { folders, useFolders } from "@/features/library/state/folders";
import { useRetainedDialogPayload } from "@/shared/hooks/use-retained-dialog-payload";
import { errorCopy } from "@/shared/lib/error-copy";
import { FolderIcon } from "@/shared/lib/folder-icons";
import { formatPlural } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { folderTemplateRows } from "./tree";
import styles from "./styles.module.css";

export function FolderTemplateDialogHost() {
  const state = useFolderTemplateDialog();
  const presentation = useRetainedDialogPayload(state);
  const payload = presentation.payload;
  if (!payload) return null;
  return payload.mode === "apply" ? (
    <ApplyTemplateDialog
      key={payload.id}
      open={presentation.open}
      parentId={payload.parentId}
    />
  ) : (
    <SaveTemplateDialog
      key={payload.id}
      open={presentation.open}
      {...payload}
    />
  );
}

function TemplatePreview({ template }: { template: FolderTemplate }) {
  const rows = folderTemplateRows(template.nodes);
  return (
    <ul className={styles.preview} aria-label="Folders this template creates">
      {rows.map(({ node, depth }) => (
        <li
          key={node.key}
          className={styles.row}
          style={{ paddingInlineStart: `calc(${depth} * var(--ds-space-xl))` }}
        >
          <FolderIcon name={node.icon} size={12} color={node.color} />
          <span>{node.name}</span>
        </li>
      ))}
    </ul>
  );
}

function loadTemplates() {
  return window.pond.query("folders.templates.list", {});
}

type TemplateList = Awaited<ReturnType<typeof loadTemplates>>;

const NO_TEMPLATES: TemplateList = { builtIn: [], custom: [] };

function useTemplates() {
  const [templates, setTemplates] = useState(NO_TEMPLATES);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    loadTemplates().then(setTemplates, () => setFailed(true));
  }, []);
  async function reload() {
    setTemplates(await loadTemplates());
  }
  return { ...templates, failed, reload };
}

function ApplyTemplateDialog({
  open,
  parentId,
}: {
  open: boolean;
  parentId: string | null;
}) {
  const { builtIn, custom, failed, reload } = useTemplates();
  const folderRows = useFolders();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [actionError, setError] = useState<string | null>(null);
  const error =
    actionError ??
    (failed ? "Couldn't load templates. Close this and try again." : null);
  const [busy, setBusy] = useState(false);
  const all = useMemo(() => [...builtIn, ...custom], [builtIn, custom]);
  const selected = all.find((entry) => entry.id === selectedId) ?? all[0];
  const isCustom = custom.some((entry) => entry.id === selected?.id);
  const parentName = parentId
    ? folderRows.find((row) => row.id === parentId)?.name
    : undefined;

  function select(id: string | null) {
    setSelectedId(id);
    setName("");
    setError(null);
  }

  async function create() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.pond.query("folders.templates.apply", {
        templateId: selected.id,
        parentId,
        name: name.trim() || undefined,
      });
      await folders.refresh();
      notify({
        id: "folder-template",
        title: `Created ${formatPlural(result.count, { one: "folder", other: "folders" })}`,
      });
      closeFolderTemplateDialog();
    } catch (error_) {
      setError(errorCopy(error_, "Couldn't create folders. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(template: FolderTemplate) {
    try {
      const copy = await window.pond.query("folders.templates.duplicate", {
        templateId: template.id,
      });
      await reload();
      select(copy.id);
    } catch (error_) {
      setError(
        errorCopy(error_, "Couldn't duplicate the template. Try again."),
      );
    }
  }

  function confirmDelete(template: FolderTemplate) {
    Dialog.confirm({
      title: `Delete "${template.name}"`,
      description:
        "Folders you already made from it stay as they are. You can't undo this.",
      confirmLabel: "Delete",
      confirmVariant: "destructive",
      onConfirm: async () => {
        await window.pond.query("folders.templates.delete", {
          templateId: template.id,
        });
        await reload();
        select(null);
      },
    });
  }

  const rootName = selected?.nodes.find(
    (node) => node.parentKey === null,
  )?.name;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) closeFolderTemplateDialog();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <Dialog.Header>
              <Dialog.Title>
                {parentName
                  ? `New Subfolder in ${parentName} from Template`
                  : "New Folder from Template"}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Content className={styles.content}>
              <div className={styles.gallery}>
                <div className={styles.list}>
                  <ToggleGroup
                    variant="list"
                    aria-label="Templates"
                    value={selected ? [selected.id] : []}
                    onValueChange={(next) => {
                      const [id] = next;
                      if (id) select(id);
                    }}
                  >
                    <p className={styles.heading}>Built-In</p>
                    {builtIn.map((template) => (
                      <Toggle key={template.id} value={template.id}>
                        {template.name}
                      </Toggle>
                    ))}
                    {custom.length ? (
                      <p className={styles.heading}>My Templates</p>
                    ) : null}
                    {custom.map((template) => (
                      <Toggle key={template.id} value={template.id}>
                        {template.name}
                      </Toggle>
                    ))}
                  </ToggleGroup>
                </div>
                {selected ? (
                  <div className={styles.detail}>
                    {selected.description ? (
                      <p className={styles.description}>
                        {selected.description}
                      </p>
                    ) : null}
                    <TemplatePreview template={selected} />
                    <Field.Root>
                      <Field.Label>Folder Name</Field.Label>
                      <Input.Root size="md" className={styles.control}>
                        <Field.Control
                          render={<Input.Field />}
                          value={name}
                          placeholder={rootName}
                          onValueChange={setName}
                          disabled={busy}
                        />
                      </Input.Root>
                    </Field.Root>
                    {isCustom ? (
                      <div className={styles.manage}>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => void duplicate(selected)}
                        >
                          Duplicate
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => confirmDelete(selected)}
                        >
                          Delete Template
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
            </Dialog.Content>
            <Dialog.Footer>
              <Dialog.Cancel disabled={busy} />
              <Button type="submit" loading={busy} disabled={!selected}>
                Create
              </Button>
            </Dialog.Footer>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SaveTemplateDialog({
  open,
  folderId,
  folderName,
}: Extract<FolderTemplateDialogState, { mode: "save" }> & { open: boolean }) {
  const folderRows = useFolders();
  const hasSubfolders = folderRows.some((row) => row.parentId === folderId);
  const [name, setName] = useState(folderName);
  const [description, setDescription] = useState("");
  const [includeSubfolders, setIncludeSubfolders] = useState(hasSubfolders);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const subfoldersId = useId();

  async function save() {
    if (busy) return;
    if (!name.trim()) {
      setError("Enter a template name.");
      field.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const template = await window.pond.query("folders.templates.saveFrom", {
        folderId,
        includeSubfolders,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      notify({ id: "folder-template", title: `Saved ${template.name}` });
      closeFolderTemplateDialog();
    } catch (error_) {
      setError(errorCopy(error_, "Couldn't save the template. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) closeFolderTemplateDialog();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Dialog.Header>
              <Dialog.Title>Save as Template</Dialog.Title>
            </Dialog.Header>
            <Dialog.Content className={styles.content}>
              <Dialog.Description>
                Keeps folder names, colors, icons, Auto-Tags, and view settings,
                but not the Saves inside.
              </Dialog.Description>
              <Field.Root>
                <Field.Label>Name</Field.Label>
                <Input.Root size="md" className={styles.control}>
                  <Field.Control
                    render={<Input.Field ref={field} />}
                    value={name}
                    onValueChange={(value) => {
                      setName(value);
                      setError(null);
                    }}
                    disabled={busy}
                    autoFocus
                    aria-invalid={!!error}
                  />
                </Input.Root>
              </Field.Root>
              <Field.Root>
                <Field.Label>Description</Field.Label>
                <Input.Root size="md" className={styles.control}>
                  <Field.Control
                    render={<Input.Textarea />}
                    value={description}
                    onValueChange={setDescription}
                    disabled={busy}
                  />
                </Input.Root>
              </Field.Root>
              {hasSubfolders ? (
                <div className={styles.check}>
                  <Checkbox.Root
                    id={subfoldersId}
                    size="sm"
                    checked={includeSubfolders}
                    onCheckedChange={(checked) =>
                      setIncludeSubfolders(checked === true)
                    }
                    disabled={busy}
                  >
                    <Checkbox.Indicator />
                  </Checkbox.Root>
                  <label htmlFor={subfoldersId}>Include Subfolders</label>
                </div>
              ) : null}
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
            </Dialog.Content>
            <Dialog.Footer>
              <Dialog.Cancel disabled={busy} />
              <Button type="submit" loading={busy}>
                Save Template
              </Button>
            </Dialog.Footer>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
