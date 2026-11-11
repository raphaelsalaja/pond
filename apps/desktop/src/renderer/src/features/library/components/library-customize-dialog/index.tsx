import {
  IconArrowRotateAnticlockwise,
  IconDots,
  IconFaceSmile,
  IconImage,
  IconStar,
} from "@pond/icons";
import {
  Button,
  Chip,
  cssVars,
  Dialog,
  Field,
  Input,
  Menu,
  Popover,
} from "@pond/ui";
import { DEFAULT_APP_ICON } from "@shared/app-icons";
import type { LibraryMarkSource } from "@shared/library-mark";
import type { LogoSource } from "@shared/logo-crop";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, type RefObject, useRef, useState } from "react";
import { listAppIconPreviews } from "@/features/settings";
import defaultAppIcon from "@/generated/app-icon-previews/aqua.png";
import { LogoCropDialog } from "@/shared/components/logo-crop-dialog";
import { errorCopy } from "@/shared/lib/error-copy";
import { gentleSpring } from "@/shared/lib/motion";
import { LIBRARY_EMOJI } from "./emoji";
import {
  DEFAULT_LIBRARY_SWATCH,
  LIBRARY_HUE_COUNT,
  LIBRARY_ICONS,
  LIBRARY_SWATCHES,
  LibraryIcon,
  type LibrarySwatch,
} from "./icons";
import {
  isDefaultMark,
  type LibraryMark,
  markKey,
  markToLogo,
  PREVIEW_EMOJI,
  PREVIEW_GLYPH,
} from "./mark";
import styles from "./styles.module.css";

type Picker = "pond" | "emoji" | "icon";

const POND_LOGOS = listAppIconPreviews();

const PICKER_LABELS: Record<Picker, string> = {
  pond: "Choose Pond Logo",
  emoji: "Choose Emoji",
  icon: "Choose Icon",
};

interface LibraryCustomizeDialogProps {
  library: {
    path: string;
    name: string;
    icon: string | null;
    mark?: LibraryMarkSource | null;
  };
  onClose: () => void;
}

interface MarkSelection {
  mark: LibraryMark;
  swatch: LibrarySwatch;
}

function restoreMark(
  library: LibraryCustomizeDialogProps["library"],
): MarkSelection {
  const source = library.mark;
  const image = { kind: "image", src: library.icon } as const;
  if (!source) return { mark: image, swatch: DEFAULT_LIBRARY_SWATCH };
  if (source.kind === "pond") {
    return {
      mark: { kind: "pond", tint: source.tint },
      swatch: DEFAULT_LIBRARY_SWATCH,
    };
  }
  const hue = source.color.split("-")[0];
  /** A retired shade keeps its hue so the mark still reopens as an emoji or icon. */
  const swatch =
    LIBRARY_SWATCHES.find((entry) => entry.id === source.color) ??
    LIBRARY_SWATCHES.find((entry) => entry.id === hue) ??
    DEFAULT_LIBRARY_SWATCH;
  if (source.kind === "emoji") {
    return { mark: { kind: "emoji", emoji: source.emoji }, swatch };
  }
  const icon = LIBRARY_ICONS.find((entry) => entry.id === source.icon);
  if (!icon) return { mark: image, swatch: DEFAULT_LIBRARY_SWATCH };
  return { mark: { kind: "icon", icon: icon.id }, swatch };
}

function markSource(
  mark: LibraryMark,
  swatch: LibrarySwatch,
): LibraryMarkSource | null {
  if (isDefaultMark(mark)) return null;
  if (mark.kind === "pond") return { kind: "pond", tint: mark.tint };
  if (mark.kind === "emoji") {
    return { kind: "emoji", emoji: mark.emoji, color: swatch.id };
  }
  if (mark.kind === "icon") {
    return { kind: "icon", icon: mark.icon, color: swatch.id };
  }
  return null;
}

function libraryFolderName(path: string): string {
  return (
    path
      .split(/[\\/]/)
      .at(-1)
      ?.replace(/\.pond$/i, "") ?? ""
  );
}

export function LibraryCustomizeDialog({
  library,
  onClose,
}: LibraryCustomizeDialogProps) {
  const client = useQueryClient();
  const tileRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLSpanElement>(null);
  const [name, setName] = useState(library.name);
  const [restored] = useState(() => restoreMark(library));
  const [mark, setMark] = useState<LibraryMark>(restored.mark);
  const [swatch, setSwatch] = useState(restored.swatch);
  const [markChanged, setMarkChanged] = useState(false);
  const [picker, setPicker] = useState<Picker>("emoji");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cropSource, setCropSource] = useState<LogoSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const nextName = name.trim().replace(/\.pond$/i, "");
  const nameChanged = nextName !== library.name;
  const changed = nameChanged || markChanged;
  const tinted = mark.kind === "emoji" || mark.kind === "icon";

  function changeMark(next: LibraryMark) {
    setMark(next);
    setMarkChanged(true);
    setError(null);
  }

  function openPicker(next: Picker) {
    setPicker(next);
    setPickerOpen(true);
    if (next === "icon" && mark.kind !== "icon") {
      changeMark({ kind: "icon", icon: "pond" });
    }
  }

  async function uploadImage(): Promise<void> {
    setError(null);
    try {
      const result = await window.pond.query("library.identity.pickIcon", {});
      if (result.ok) setCropSource(result.image);
      else if (result.reason !== "cancelled") {
        setError("Choose a supported image.");
      }
    } catch (cause) {
      setError(errorCopy(cause, "Couldn't choose the image. Try again."));
    }
  }

  async function submit(): Promise<void> {
    if (!changed || !nextName) return;
    setBusy(true);
    setError(null);
    try {
      const logo = markChanged
        ? {
            icon: await markToLogo(mark, tileRef.current),
            mark: markSource(mark, swatch),
          }
        : {};
      const result =
        nameChanged && nextName !== libraryFolderName(library.path)
          ? await window.pond.query("library.rename", {
              name: nextName,
              ...logo,
            })
          : await window.pond.query("library.identity.update", {
              name: nameChanged ? nextName : undefined,
              ...logo,
            });
      if (!result.ok) {
        setError(result.error ?? "Couldn't save the library. Try again.");
        return;
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: ["library-info"] }),
        client.invalidateQueries({ queryKey: ["recent-libraries"] }),
      ]);
      onClose();
    } catch (cause) {
      setError(errorCopy(cause, "Couldn't save the library. Try again."));
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
        <Dialog.Popup className={styles.popup} aria-label="Customize Library">
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
                  ref={tileRef}
                  className={styles.tile}
                  data-tinted={tinted || undefined}
                  style={
                    tinted
                      ? cssVars({
                          "--tile-color": swatch.fill,
                          "--glyph-color": swatch.contrast,
                        })
                      : undefined
                  }
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={markKey(mark)}
                      data-mark={markKey(mark)}
                      className={styles.glyph}
                      initial={{ opacity: 0, scale: 0.5, filter: "blur(4px)" }}
                      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, scale: 0.5, filter: "blur(4px)" }}
                      transition={reduceMotion ? { duration: 0 } : gentleSpring}
                    >
                      <MarkGlyph mark={mark} />
                    </motion.span>
                  </AnimatePresence>
                  <span ref={editRef} className={styles.edit}>
                    <MarkMenu
                      customized={!isDefaultMark(mark)}
                      disabled={busy}
                      pickerOpen={pickerOpen}
                      onPick={openPicker}
                      onUpload={() => void uploadImage()}
                      onReset={() => changeMark({ kind: "image", src: null })}
                    />
                  </span>
                </div>
                <MarkPicker
                  anchor={editRef}
                  picker={picker}
                  open={pickerOpen}
                  mark={mark}
                  onOpenChange={setPickerOpen}
                  onChange={(next) => {
                    changeMark(next);
                    if (next.kind !== "icon") setPickerOpen(false);
                  }}
                />
              </div>
              <Field.Root>
                <Field.Label>Name</Field.Label>
                <Input.Root>
                  <Field.Control
                    render={<Input.Field />}
                    value={name}
                    onValueChange={setName}
                    maxLength={255}
                    disabled={busy}
                  />
                </Input.Root>
              </Field.Root>
              <AnimatePresence initial={false}>
                {tinted ? (
                  <ColorField
                    value={swatch}
                    disabled={busy}
                    onChange={(next) => {
                      setSwatch(next);
                      setMarkChanged(true);
                    }}
                  />
                ) : null}
              </AnimatePresence>
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
            </Dialog.Content>
            <Dialog.Footer>
              <Dialog.Cancel disabled={busy} />
              <Dialog.Confirm
                type="submit"
                loading={busy}
                disabled={!changed || !nextName}
              >
                Save
              </Dialog.Confirm>
            </Dialog.Footer>
          </form>
          {cropSource ? (
            <LogoCropDialog
              source={cropSource}
              onClose={() => setCropSource(null)}
              onCrop={(icon) => {
                changeMark({ kind: "image", src: icon });
                setCropSource(null);
              }}
            />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface ColorFieldProps {
  value: LibrarySwatch;
  disabled: boolean;
  onChange: (swatch: LibrarySwatch) => void;
}

function swatchDelay(index: number): number {
  const column = index % LIBRARY_HUE_COUNT;
  const row = Math.floor(index / LIBRARY_HUE_COUNT);
  return (column + row) * 0.015;
}

function ColorField({ value, disabled, onChange }: ColorFieldProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={styles.colors}
      initial={{ height: 0, opacity: 0, marginTop: -16 }}
      animate={{ height: "auto", opacity: 1, marginTop: 0 }}
      exit={{ height: 0, opacity: 0, marginTop: -16 }}
      transition={reduceMotion ? { duration: 0 } : gentleSpring}
    >
      <Field.Root>
        <Field.Label>Color</Field.Label>
        <div
          className={styles.swatches}
          role="radiogroup"
          aria-label="Color"
          style={cssVars({ "--swatch-columns": String(LIBRARY_HUE_COUNT) })}
        >
          {LIBRARY_SWATCHES.map((swatch, index) => (
            <motion.span
              key={swatch.id}
              className={styles.cell}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { ...gentleSpring, delay: swatchDelay(index) }
              }
            >
              <Button
                type="button"
                icon
                size="xs"
                variant="ghost"
                role="radio"
                aria-label={swatch.label}
                aria-checked={value.id === swatch.id}
                disabled={disabled}
                onClick={() => onChange(swatch)}
              >
                <Chip.Swatch
                  color={swatch.fill}
                  selected={value.id === swatch.id}
                />
              </Button>
            </motion.span>
          ))}
        </div>
      </Field.Root>
    </motion.div>
  );
}

function MarkGlyph({ mark }: { mark: LibraryMark }) {
  if (mark.kind === "emoji") {
    return (
      <span className={styles.emoji} style={{ fontSize: PREVIEW_EMOJI }}>
        {mark.emoji}
      </span>
    );
  }
  if (mark.kind === "icon") {
    return <LibraryIcon name={mark.icon} size={PREVIEW_GLYPH} />;
  }
  if (mark.kind === "pond") {
    const logo = POND_LOGOS.find((entry) => entry.id === mark.tint);
    return (
      <img
        className={styles.image}
        src={logo?.preview ?? defaultAppIcon}
        alt=""
      />
    );
  }
  return (
    <img className={styles.image} src={mark.src ?? defaultAppIcon} alt="" />
  );
}

interface MarkMenuProps {
  customized: boolean;
  disabled: boolean;
  pickerOpen: boolean;
  onPick: (picker: Picker) => void;
  onUpload: () => void;
  onReset: () => void;
}

function MarkMenu({
  customized,
  disabled,
  pickerOpen,
  onPick,
  onUpload,
  onReset,
}: MarkMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        icon
        size="sm"
        variant="secondary"
        rounding="full"
        disabled={disabled}
        aria-label="Edit Logo"
      >
        <IconDots size={12} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={8}>
          <Menu.Popup finalFocus={!pickerOpen}>
            <Menu.Item onClick={() => onPick("pond")}>
              <Menu.ItemIcon>
                <LibraryIcon name="pond" />
              </Menu.ItemIcon>
              <Menu.ItemLabel>Choose Pond Logo</Menu.ItemLabel>
            </Menu.Item>
            <Menu.Item onClick={() => onPick("emoji")}>
              <Menu.ItemIcon>
                <IconFaceSmile />
              </Menu.ItemIcon>
              <Menu.ItemLabel>Choose Emoji</Menu.ItemLabel>
            </Menu.Item>
            <Menu.Item onClick={() => onPick("icon")}>
              <Menu.ItemIcon>
                <IconStar />
              </Menu.ItemIcon>
              <Menu.ItemLabel>Choose Icon</Menu.ItemLabel>
            </Menu.Item>
            <Menu.Item onClick={onUpload}>
              <Menu.ItemIcon>
                <IconImage />
              </Menu.ItemIcon>
              <Menu.ItemLabel>Upload Image</Menu.ItemLabel>
            </Menu.Item>
            {customized ? (
              <>
                <Menu.Separator />
                <Menu.Item onClick={onReset}>
                  <Menu.ItemIcon>
                    <IconArrowRotateAnticlockwise />
                  </Menu.ItemIcon>
                  <Menu.ItemLabel>Reset Logo</Menu.ItemLabel>
                </Menu.Item>
              </>
            ) : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

interface MarkPickerProps {
  anchor: RefObject<HTMLSpanElement | null>;
  picker: Picker;
  open: boolean;
  mark: LibraryMark;
  onOpenChange: (open: boolean) => void;
  onChange: (mark: LibraryMark) => void;
}

interface PickerOption {
  key: string;
  label: string;
  content: ReactNode;
  selected: boolean;
  next: LibraryMark;
}

function pickerOptions(picker: Picker, mark: LibraryMark): PickerOption[] {
  if (picker === "pond") {
    return POND_LOGOS.map((entry) => ({
      key: entry.id,
      label: entry.label,
      content: <img className={styles.logo} src={entry.preview} alt="" />,
      selected:
        mark.kind === "pond"
          ? mark.tint === entry.id
          : isDefaultMark(mark) && entry.id === DEFAULT_APP_ICON,
      next: { kind: "pond", tint: entry.id },
    }));
  }
  if (picker === "emoji") {
    return LIBRARY_EMOJI.map((entry) => ({
      key: entry.emoji,
      label: entry.label,
      content: <span className={styles.option}>{entry.emoji}</span>,
      selected: mark.kind === "emoji" && mark.emoji === entry.emoji,
      next: { kind: "emoji", emoji: entry.emoji },
    }));
  }
  return LIBRARY_ICONS.map(({ id, label, Icon }) => ({
    key: id,
    label,
    content: <Icon />,
    selected: mark.kind === "icon" && mark.icon === id,
    next: { kind: "icon", icon: id },
  }));
}

function MarkPicker({
  anchor,
  picker,
  open,
  mark,
  onOpenChange,
  onChange,
}: MarkPickerProps) {
  const options = pickerOptions(picker, mark);

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Portal>
        <Popover.Positioner
          anchor={anchor}
          side="bottom"
          align="start"
          sideOffset={8}
        >
          <Popover.Popup
            className={styles.picker}
            aria-label={PICKER_LABELS[picker]}
          >
            <div className={styles.grid} data-scroll-fade="vertical">
              {options.map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  icon
                  size="md"
                  variant={option.selected ? "secondary" : "ghost"}
                  aria-label={option.label}
                  aria-pressed={option.selected}
                  onClick={() => onChange(option.next)}
                >
                  {option.content}
                </Button>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
