import {
  IconArrowsExpandY,
  IconCheckboxChecked,
  IconContrast,
  IconImage,
  IconMinus,
  IconPlus,
} from "@pond/icons";
import { Button } from "@pond/ui/button";
import { Checkbox } from "@pond/ui/checkbox";
import { Dialog } from "@pond/ui/dialog";
import { Empty } from "@pond/ui/empty";
import { Slider } from "@pond/ui/slider";
import { Toolbar } from "@pond/ui/toolbar";
import { Tooltip } from "@pond/ui/tooltip";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LibraryTargets, OverlayResult } from "@/utils/messaging";
import {
  collectCandidates,
  describe,
  facetCounts,
  MAX_IMAGES,
  matchesFilters,
  sizeBucket,
} from "./discover";
import type { Candidate, ImageFilters, PageImage } from "./discover";
import { Sidebar } from "./sidebar";
import styles from "./styles.module.css";

const ZOOM = { min: 96, max: 320, initial: 160, step: 32 };
const SCROLL_STEPS = 40;
const SCROLL_PAUSE_MS = 250;

const INITIAL_FILTERS: ImageFilters = {
  query: "",
  sizes: new Set(["large", "medium", "small"]),
  hiddenFormats: new Set(),
  hiddenDomains: new Set(),
  minWidth: 0,
  minHeight: 0,
};

function merge(
  current: Array<Candidate>,
  found: Array<Candidate>,
): Array<Candidate> {
  const known = new Set(current.map((candidate) => candidate.url));
  return [
    ...current,
    ...found.filter((candidate) => !known.has(candidate.url)),
  ];
}

/** Loads images Pond doesn't know the size of yet, so size filters and tile labels can fill in. */
function useProbedSizes(candidates: Array<Candidate>) {
  const [sizes, setSizes] = useState<ReadonlyMap<string, [number, number]>>(
    new Map(),
  );
  const probing = useRef(new Map<string, HTMLImageElement>());
  useEffect(() => {
    for (const candidate of candidates) {
      if (candidate.width || probing.current.has(candidate.url)) continue;
      const probe = new Image();
      probe.decoding = "async";
      probe.onload = () =>
        setSizes((current) =>
          new Map(current).set(candidate.url, [
            probe.naturalWidth,
            probe.naturalHeight,
          ]),
        );
      probe.src = candidate.url;
      probing.current.set(candidate.url, probe);
    }
  }, [candidates]);
  useEffect(
    () => () => {
      for (const probe of probing.current.values()) probe.src = "";
    },
    [],
  );
  return sizes;
}

async function scrollThroughPage(): Promise<void> {
  const start = { left: scrollX, top: scrollY };
  for (let step = 0; step < SCROLL_STEPS; step++) {
    const before = scrollY;
    window.scrollBy({ top: innerHeight, behavior: "instant" });
    await new Promise((resolve) => {
      setTimeout(resolve, SCROLL_PAUSE_MS);
    });
    if (scrollY === before) {
      break;
    }
  }
  window.scrollTo({ ...start, behavior: "instant" });
}

interface ImagePickerProps {
  library: LibraryTargets;
  container: HTMLElement;
  onFinish: (result: OverlayResult | null) => void;
}

export function ImagePicker({
  library,
  container,
  onFinish,
}: ImagePickerProps) {
  const id = useId();
  const [candidates, setCandidates] = useState(() =>
    collectCandidates(document),
  );
  const probed = useProbedSizes(candidates);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [zoom, setZoom] = useState(ZOOM.initial);
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<Array<string>>([]);
  const [folderIds, setFolderIds] = useState<Array<string>>([]);
  const shift = useRef(false);

  useEffect(() => {
    const track = (event: KeyboardEvent | PointerEvent) => {
      shift.current = event.shiftKey;
    };
    for (const type of ["pointerdown", "keydown", "keyup"] as const) {
      window.addEventListener(type, track, true);
    }
    return () => {
      for (const type of ["pointerdown", "keydown", "keyup"] as const) {
        window.removeEventListener(type, track, true);
      }
    };
  }, []);

  const images: Array<PageImage> = useMemo(
    () =>
      candidates.map((candidate) => {
        const size = probed.get(candidate.url);
        return describe(
          size ? { ...candidate, width: size[0], height: size[1] } : candidate,
        );
      }),
    [candidates, probed],
  );
  const shown = images.filter((image) => matchesFilters(image, filters));
  const picked = shown.filter((image) => selected.has(image.url));
  const allShown = shown.length > 0 && picked.length === shown.length;
  const over = picked.length > MAX_IMAGES;
  const canSave = picked.length > 0 && !over;

  const sizes = facetCounts(images, selected, (image) =>
    image.width ? sizeBucket(image.width, image.height) : null,
  );
  const formats = facetCounts(images, selected, (image) => image.format);
  const domains = facetCounts(images, selected, (image) => image.domain);

  const setMany = (urls: Array<string>, on: boolean) => {
    const next = new Set(selected);
    for (const url of urls) {
      if (on) next.add(url);
      else next.delete(url);
    }
    setSelected(next);
  };

  /** Shift extends from the last tile you toggled, whether by click or Space. */
  const toggleTile = (index: number, on: boolean) => {
    const range =
      shift.current && anchor !== null
        ? shown.slice(Math.min(anchor, index), Math.max(anchor, index) + 1)
        : shown.slice(index, index + 1);
    setMany(
      range.map((image) => image.url),
      on,
    );
    setAnchor(index);
  };

  const save = () =>
    onFinish({
      kind: "images",
      urls: picked.map((image) => image.url),
      tags,
      folderIds,
    });

  const stepZoom = (direction: 1 | -1) =>
    setZoom(
      Math.min(ZOOM.max, Math.max(ZOOM.min, zoom + direction * ZOOM.step)),
    );

  const invert = () => {
    const next = new Set(selected);
    for (const image of shown) {
      if (next.has(image.url)) next.delete(image.url);
      else next.add(image.url);
    }
    setSelected(next);
  };

  const loadMore = async () => {
    setLoading(true);
    await scrollThroughPage();
    setCandidates((current) => merge(current, collectCandidates(document)));
    setLoading(false);
  };

  return (
    <Dialog.Root
      open
      modal="trap-focus"
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open) onFinish(null);
      }}
    >
      <Dialog.Portal container={container}>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup
          className={styles.popup}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) {
              return;
            }
            event.preventDefault();
            if (canSave) save();
          }}
        >
          <Dialog.Header className={styles.header}>
            <Dialog.Title className={styles.title}>
              Save Images{" "}
              <span className={styles.count}>
                ({picked.length}/{shown.length})
              </span>
            </Dialog.Title>
            <div className={styles.zoom}>
              <Button
                icon
                size="xs"
                variant="ghost"
                aria-label="Smaller Thumbnails"
                disabled={zoom <= ZOOM.min}
                onClick={() => stepZoom(-1)}
              >
                <IconMinus size={12} />
              </Button>
              <Slider.Root
                className={styles.slider}
                aria-label="Thumbnail Size"
                min={ZOOM.min}
                max={ZOOM.max}
                value={zoom}
                onValueChange={(value) => {
                  const [next] = [value].flat();
                  if (next !== undefined) setZoom(next);
                }}
              >
                <Slider.Control>
                  <Slider.Track>
                    <Slider.Indicator />
                    <Slider.Thumb aria-label="Thumbnail Size" />
                  </Slider.Track>
                </Slider.Control>
              </Slider.Root>
              <Button
                icon
                size="xs"
                variant="ghost"
                aria-label="Larger Thumbnails"
                disabled={zoom >= ZOOM.max}
                onClick={() => stepZoom(1)}
              >
                <IconPlus size={12} />
              </Button>
            </div>
            <Toolbar.Root className={styles.actions} aria-label="Images">
              <Toolbar.Button
                render={<Button size="sm" variant="ghost" loading={loading} />}
                onClick={() => void loadMore()}
              >
                <IconArrowsExpandY size={12} />
                Load More
              </Toolbar.Button>
              <Toolbar.Separator orientation="vertical" />
              <Tooltip
                label={allShown ? "Deselect All" : "Select All"}
                container={container}
              >
                <Toolbar.Button
                  render={
                    <Button
                      icon
                      size="sm"
                      variant="ghost"
                      aria-label={allShown ? "Deselect All" : "Select All"}
                    />
                  }
                  disabled={shown.length === 0}
                  onClick={() =>
                    setMany(
                      shown.map((image) => image.url),
                      !allShown,
                    )
                  }
                >
                  <IconCheckboxChecked />
                </Toolbar.Button>
              </Tooltip>
              <Tooltip label="Invert Selection" container={container}>
                <Toolbar.Button
                  render={
                    <Button
                      icon
                      size="sm"
                      variant="ghost"
                      aria-label="Invert Selection"
                    />
                  }
                  disabled={shown.length === 0}
                  onClick={invert}
                >
                  <IconContrast />
                </Toolbar.Button>
              </Tooltip>
            </Toolbar.Root>
          </Dialog.Header>

          <div className={styles.body}>
            <Sidebar
              filters={filters}
              onFiltersChange={setFilters}
              sizes={sizes}
              formats={formats}
              domains={domains}
              library={library}
              tags={tags}
              onTagsChange={setTags}
              folderIds={folderIds}
              onFolderIdsChange={setFolderIds}
              container={container}
            />

            {shown.length > 0 ? (
              <div
                className={styles.grid}
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${zoom}px, 1fr))`,
                }}
              >
                {shown.map((image, index) => {
                  const checked = selected.has(image.url);
                  const checkId = `${id}-${index}`;
                  return (
                    <label
                      key={image.url}
                      className={styles.tile}
                      htmlFor={checkId}
                      data-checked={checked || undefined}
                    >
                      <span className={styles.frame}>
                        <img
                          className={styles.image}
                          src={image.url}
                          alt=""
                          loading="lazy"
                          onLoad={(event) => {
                            event.currentTarget.dataset.loaded = "";
                          }}
                        />
                        <Checkbox.Root
                          id={checkId}
                          size="sm"
                          className={styles.check}
                          checked={checked}
                          aria-label={image.alt || image.name}
                          onCheckedChange={(next) => toggleTile(index, next)}
                        >
                          <Checkbox.Indicator />
                        </Checkbox.Root>
                      </span>
                      <span className={styles.name}>{image.name}</span>
                      <span className={styles.size}>
                        {image.width
                          ? `${image.width} × ${image.height} · ${image.format}`
                          : image.format}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <Empty.Root size="card" className={styles.empty}>
                <Empty.Media>
                  <IconImage size={14} />
                </Empty.Media>
                <Empty.Title>
                  {images.length === 0
                    ? "No images found"
                    : "No matching images"}
                </Empty.Title>
                <Empty.Description>
                  {images.length === 0
                    ? "Load More scrolls the page to find images that load later."
                    : "Turn a filter back on to see more images."}
                </Empty.Description>
              </Empty.Root>
            )}
          </div>

          <Dialog.Footer
            leading={
              over ? `Pick up to ${MAX_IMAGES} images at a time.` : undefined
            }
          >
            <Dialog.Cancel />
            <Dialog.Confirm disabled={!canSave} onClick={save}>
              Save
            </Dialog.Confirm>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
