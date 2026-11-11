import { IconDots } from "@pond/icons";
import {
  Button,
  Chip,
  cssVars,
  Dialog,
  Field,
  Input,
  Popover,
  Tooltip,
} from "@pond/ui";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { saveFolderPresentation } from "@/features/library/state/folder-presentation";
import { folders } from "@/features/library/state/folders";
import {
  FOLDER_ICONS,
  FOLDER_SWATCHES,
  FolderIcon,
  type FolderIconId,
  folderColorCss,
} from "@/shared/lib/folder-icons";
import { gentleSpring } from "@/shared/lib/motion";
import styles from "./styles.module.css";

interface FolderCustomizeDialogProps {
  folder: {
    id: string;
    name: string;
    color: string | null;
  };
  folderIcon?: FolderIconId;
  onClose: () => void;
}

export function FolderCustomizeDialog({
  folder,
  folderIcon,
  onClose,
}: FolderCustomizeDialogProps) {
  const initialIcon = folderIcon ?? "folder";
  const [name, setName] = useState(folder.name);
  const [icon, setIcon] = useState<FolderIconId>(initialIcon);
  const [color, setColor] = useState<string | null>(folder.color);
  const [description, setDescription] = useState("");
  const [initialDescription, setInitialDescription] = useState("");
  const [externalLink, setExternalLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameInvalid, setNameInvalid] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();
  const trimmedName = name.trim();
  const changed =
    trimmedName !== folder.name ||
    icon !== initialIcon ||
    color !== folder.color ||
    description !== initialDescription;

  useEffect(() => {
    let current = true;
    void window.pond
      .query("folders.metadata.get", { folderId: folder.id })
      .then((metadata) => {
        if (!current) return;
        const nextDescription = metadata.description ?? "";
        setDescription(nextDescription);
        setInitialDescription(nextDescription);
        setExternalLink(metadata.externalLink);
      });
    return () => {
      current = false;
    };
  }, [folder.id]);

  async function submit(): Promise<void> {
    if (busy || !changed) return;
    if (!trimmedName) {
      setNameInvalid(true);
      nameField.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const results = await Promise.all([
        trimmedName !== folder.name
          ? window.pond.query("folders.rename", {
              id: folder.id,
              name: trimmedName,
            })
          : Promise.resolve({ ok: true }),
        icon !== initialIcon
          ? saveFolderPresentation(folder.id, { icon }).then(() => ({
              ok: true,
            }))
          : Promise.resolve({ ok: true }),
        color !== folder.color
          ? window.pond
              .query("folders.setColor", { id: folder.id, color })
              .then(() => ({ ok: true }))
          : Promise.resolve({ ok: true }),
        description !== initialDescription
          ? window.pond.query("folders.metadata.set", {
              folderId: folder.id,
              description: description.trim() || null,
              externalLink,
            })
          : Promise.resolve({ ok: true }),
      ]);
      if (results.some((result) => !result.ok)) {
        throw new Error("Folder changes were rejected.");
      }
      await folders.refresh();
      onClose();
    } catch {
      setError("Couldn't save folder. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open, details) => {
        if (busy) details.cancel();
        else if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup} aria-label="Customize Folder">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Dialog.Header data-empty />
            <Dialog.Content className={styles.content}>
              <div className={styles.hero}>
                <div
                  className={styles.tile}
                  style={cssVars({
                    "--tile-color":
                      folderColorCss(color) ?? "var(--ds-gray-11)",
                  })}
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={icon}
                      className={styles.glyph}
                      initial={{ opacity: 0, scale: 0.5, filter: "blur(4px)" }}
                      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, scale: 0.5, filter: "blur(4px)" }}
                      transition={reduceMotion ? { duration: 0 } : gentleSpring}
                    >
                      <FolderIcon name={icon} size={40} />
                    </motion.span>
                  </AnimatePresence>
                  <AppearancePicker
                    icon={icon}
                    color={color}
                    disabled={busy}
                    onIconChange={setIcon}
                    onColorChange={setColor}
                  />
                </div>
              </div>
              <Field.Root invalid={(nameInvalid && !trimmedName) || undefined}>
                <Field.Label>Name</Field.Label>
                <Input.Root>
                  <Field.Control
                    ref={nameField}
                    render={<Input.Field />}
                    value={name}
                    onValueChange={setName}
                    maxLength={255}
                    disabled={busy}
                  />
                </Input.Root>
                {nameInvalid && !trimmedName ? (
                  <Field.Error match>Name the folder.</Field.Error>
                ) : null}
              </Field.Root>
              <Field.Root>
                <Field.Label>Description</Field.Label>
                <Input.Root>
                  <Field.Control
                    render={<Input.Textarea rows={3} />}
                    value={description}
                    onValueChange={setDescription}
                    maxLength={4000}
                    disabled={busy}
                  />
                </Input.Root>
              </Field.Root>
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
            </Dialog.Content>
            <Dialog.Footer>
              <Dialog.Cancel disabled={busy} />
              <Dialog.Confirm type="submit" loading={busy} disabled={!changed}>
                Save
              </Dialog.Confirm>
            </Dialog.Footer>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface AppearancePickerProps {
  icon: FolderIconId;
  color: string | null;
  disabled: boolean;
  onIconChange: (icon: FolderIconId) => void;
  onColorChange: (color: string | null) => void;
}

function AppearancePicker({
  icon,
  color,
  disabled,
  onIconChange,
  onColorChange,
}: AppearancePickerProps) {
  return (
    <Popover.Root>
      <Tooltip label="Icon and Color">
        <Popover.Trigger
          render={
            <Button
              type="button"
              icon
              size="sm"
              variant="secondary"
              rounding="full"
              className={styles.edit}
              disabled={disabled}
            />
          }
          aria-label="Icon and Color"
        >
          <IconDots size={12} />
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Positioner side="bottom" sideOffset={8}>
          <Popover.Popup className={styles.picker} aria-label="Icon and Color">
            <div className={styles.grid} data-scroll-fade="vertical">
              {FOLDER_ICONS.map(({ id, label, Icon }) => (
                <Tooltip key={id} label={label}>
                  <Button
                    type="button"
                    icon
                    size="md"
                    variant={icon === id ? "tertiary" : "ghost"}
                    aria-label={label}
                    aria-pressed={icon === id}
                    onClick={() => onIconChange(id)}
                  >
                    <Icon />
                  </Button>
                </Tooltip>
              ))}
            </div>
            <div className={styles.swatches}>
              {FOLDER_SWATCHES.map((swatch) => (
                <Tooltip key={swatch.label} label={swatch.label}>
                  <Button
                    type="button"
                    icon
                    size="md"
                    variant="ghost"
                    aria-label={swatch.label}
                    aria-pressed={color === swatch.id}
                    onClick={() => onColorChange(swatch.id)}
                  >
                    <Chip.Swatch
                      color={swatch.css}
                      selected={color === swatch.id}
                    />
                  </Button>
                </Tooltip>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
