import {
  IconImagePlus,
  IconImageSparkle,
  IconMagnifier,
  IconNut,
  IconTextToImage,
} from "@pond/icons";
import { Menu } from "@pond/ui";
import { useEffect, useRef, useState } from "react";
import {
  loadImage,
  mediaImageEmbedding,
  mediaModelVersion,
} from "@/features/enrichment";
import {
  setSemanticQuery,
  setVisualProbe,
  useSemanticQuery,
  useVisualProbe,
} from "@/features/library/state/view-store";
import type { VisualProbe } from "@/features/library/state/view-store";
import { draggingSaveIds } from "@/features/saves";
import { pool } from "@/features/saves/pool";
import { useMenuFilterQuery } from "@/shared/hooks/use-menu-filter-query";
import { openSettings } from "@/shared/lib/open-settings";
import { usePrefs } from "@/shared/state/prefs";
import { FilterChip, FilterPopup } from "../chip";
import styles from "./styles.module.css";

export function SemanticPanel({ search }: { search: string }) {
  const [ai] = usePrefs("ai");
  return ai.semanticSearch === true ? (
    <SemanticEditor search={search} />
  ) : (
    <IndexOff
      title="Semantic Search is off"
      hash="setting-processing-semanticSearch"
    />
  );
}

export function VisualPanel() {
  const [ai] = usePrefs("ai");
  const probe = useVisualProbe();
  return ai.enableClip === true ? (
    <VisualEditor probe={probe} />
  ) : (
    <IndexOff
      title="Visual Similarity is off"
      hash="setting-processing-enableClip"
    />
  );
}

export function SemanticChip() {
  const query = useSemanticQuery();
  const { query: search, onValueChange, reset } = useMenuFilterQuery();
  const active = Boolean(query);
  return (
    <FilterChip
      icon={<IconTextToImage />}
      label={query ?? "Semantic"}
      active={active}
      ariaLabel={active ? `Semantic: ${query}` : "Semantic"}
      onClear={active ? () => setSemanticQuery(null) : undefined}
      clearLabel="Clear Semantic Filter"
      search={{
        filter: null,
        value: search,
        onValueChange,
        autoHighlight: true,
      }}
      onOpen={reset}
    >
      <FilterPopup layout="content" aria-label="Semantic Filter">
        <SemanticPanel search={search} />
      </FilterPopup>
    </FilterChip>
  );
}

function SemanticEditor({ search }: { search: string }) {
  const current = useSemanticQuery();
  const draft = search.trim();
  return (
    <>
      <Menu.Input
        aria-label="Semantic Query"
        placeholder="Describe what you're looking for"
      />
      <Menu.FilterList>
        {draft && draft !== current ? (
          <Menu.Item onClick={() => setSemanticQuery(draft)}>
            <Menu.ItemIcon>
              <IconMagnifier />
            </Menu.ItemIcon>
            <Menu.ItemLabel title={draft}>{`Find “${draft}”`}</Menu.ItemLabel>
          </Menu.Item>
        ) : null}
        {current ? (
          <Menu.CheckboxItem
            closeOnClick={false}
            checked
            onCheckedChange={() => setSemanticQuery(null)}
          >
            <Menu.CheckboxItemIndicator reveal="active" />
            <Menu.ItemIcon>
              <IconTextToImage />
            </Menu.ItemIcon>
            <Menu.ItemLabel title={current}>{current}</Menu.ItemLabel>
          </Menu.CheckboxItem>
        ) : null}
        {!draft && !current ? (
          <Menu.Item disabled>
            <Menu.ItemLabel>
              For example, a black cat by a window
            </Menu.ItemLabel>
          </Menu.Item>
        ) : null}
      </Menu.FilterList>
    </>
  );
}

export function VisualChip() {
  const probe = useVisualProbe();
  const active = Boolean(probe);
  return (
    <FilterChip
      icon={<IconImageSparkle />}
      label={probe?.label ?? "Visual Match"}
      active={active}
      ariaLabel={active ? `Visual Match: ${probe?.label}` : "Visual Match"}
      onClear={active ? () => setVisualProbe(null) : undefined}
      clearLabel="Clear Visual Match Filter"
    >
      <FilterPopup layout="content" aria-label="Visual Match Filter">
        <VisualPanel />
      </FilterPopup>
    </FilterChip>
  );
}

function imageFile(data: DataTransfer | null): File | undefined {
  return (
    [...(data?.items ?? [])]
      .map((item) => item.getAsFile())
      .find((file) => file?.type.startsWith("image/")) ?? undefined
  );
}

function VisualEditor({ probe }: { probe: VisualProbe | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The popup, not an input, holds focus, so paste is read from the window. */
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = imageFile(event.clipboardData);
      if (!file) {
        return;
      }
      event.preventDefault();
      void encodeFile(file, setBusy, setError);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);
  return (
    <fieldset
      aria-label="Image to Match"
      className={styles.drop}
      data-over={over || undefined}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const dragged = draggingSaveIds()[0];
        if (dragged) {
          const save = pool.get(dragged);
          setVisualProbe({
            kind: "saveId",
            id: dragged,
            label: save?.title?.trim() || "Selected Save",
          });
          return;
        }
        const file = event.dataTransfer.files[0];
        if (file) {
          void encodeFile(file, setBusy, setError);
        }
      }}
    >
      {probe ? (
        <Menu.CheckboxItem
          closeOnClick={false}
          checked
          onCheckedChange={() => setVisualProbe(null)}
        >
          <Menu.CheckboxItemIndicator reveal="active" />
          <Menu.ItemIcon>
            <IconImageSparkle />
          </Menu.ItemIcon>
          <Menu.ItemLabel title={probe.label}>{probe.label}</Menu.ItemLabel>
        </Menu.CheckboxItem>
      ) : null}
      <Menu.Item
        closeOnClick={false}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <Menu.ItemIcon>
          <IconImagePlus />
        </Menu.ItemIcon>
        <Menu.ItemLabel>
          {busy ? "Matching" : probe ? "Choose Another Image" : "Choose Image"}
        </Menu.ItemLabel>
      </Menu.Item>
      <Menu.Separator />
      <p className={styles.hint} data-error={error ? "" : undefined}>
        {error ?? "Drop or paste an image, or drag a save here."}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void encodeFile(file, setBusy, setError);
          }
          event.target.value = "";
        }}
      />
    </fieldset>
  );
}

function IndexOff({ title, hash }: { title: string; hash: string }) {
  return (
    <>
      <Menu.Item disabled>
        <Menu.ItemLabel>{title}</Menu.ItemLabel>
      </Menu.Item>
      <Menu.Item onClick={() => openSettings("processing", hash)}>
        <Menu.ItemIcon>
          <IconNut />
        </Menu.ItemIcon>
        <Menu.ItemLabel>Open Processing Settings</Menu.ItemLabel>
      </Menu.Item>
    </>
  );
}

async function encodeFile(
  file: File,
  setBusy: (busy: boolean) => void,
  setError: (error: string | null) => void,
): Promise<void> {
  setBusy(true);
  setError(null);
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const vec = await mediaImageEmbedding(image);
    setVisualProbe({
      kind: "vector",
      model: mediaModelVersion(),
      values: Array.from(vec),
      label: file.name || "Dropped image",
    });
  } catch {
    setError("Couldn't match this image. Try another one.");
  } finally {
    URL.revokeObjectURL(url);
    setBusy(false);
  }
}
