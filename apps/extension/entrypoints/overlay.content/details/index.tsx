import { IconGlobe, IconImage } from "@pond/icons";
import { Dialog } from "@pond/ui/dialog";
import { Input } from "@pond/ui/input";
import { Keyboard } from "@pond/ui/keyboard";
import { Rating } from "@pond/ui/rating";
import { useRef, useState } from "react";
import { Targets } from "@/components/targets";
import type {
  DetailsDraft,
  LibraryTargets,
  OverlayResult,
} from "@/utils/messaging";
import styles from "./styles.module.css";

const MAC = navigator.userAgent.includes("Mac");

interface DetailsProps {
  draft: DetailsDraft;
  library: LibraryTargets;
  container: HTMLElement;
  onFinish: (result: OverlayResult | null) => void;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The overlay runs inside the page, so a page save can preview its own share image. */
function shareImage(): string | null {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[property="og:image"], meta[name="twitter:image"]',
  );
  const content = meta?.content;
  if (!content) return null;
  try {
    const url = new URL(content, location.href);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function previewSource(draft: DetailsDraft): string | null {
  if (draft.preview) return draft.preview.src;
  if (draft.kind === "page" && draft.url === location.href) return shareImage();
  return null;
}

function Preview({ draft }: { draft: DetailsDraft }) {
  const [src] = useState(() => previewSource(draft));
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState(() =>
    draft.preview?.width && draft.preview.height
      ? { width: draft.preview.width, height: draft.preview.height }
      : null,
  );
  const media = draft.kind === "media" || draft.kind === "screenshot";

  return (
    <div className={styles.preview} data-kind={draft.kind}>
      {src && !failed ? (
        <img
          className={styles.image}
          src={src}
          alt=""
          onError={() => setFailed(true)}
          onLoad={(event) => {
            if (!media || size) return;
            const { naturalWidth: width, naturalHeight: height } =
              event.currentTarget;
            if (width && height) setSize({ width, height });
          }}
        />
      ) : (
        <div className={styles.placeholder}>
          {media ? <IconImage size={32} /> : <IconGlobe size={32} />}
          <span className={styles.host}>
            {hostOf(draft.originUrl ?? draft.url)}
          </span>
        </div>
      )}
      {media && size ? (
        <span className={styles.badge}>
          {size.width} × {size.height}
        </span>
      ) : null}
    </div>
  );
}

export function Details({ draft, library, container, onFinish }: DetailsProps) {
  const [title, setTitle] = useState(draft.title);
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<Array<string>>([]);
  const [folderIds, setFolderIds] = useState<Array<string>>([]);
  const [fishId, setFishId] = useState<string | null>(null);
  const name = useRef<HTMLInputElement>(null);

  const save = () =>
    onFinish({
      kind: "details",
      draft,
      metadata: { title, notes, rating, tags, folderIds, fishId },
    });

  return (
    <Dialog.Root
      open
      /** Tag and fish pickers portal onto the overlay layer, outside this popup. */
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
          initialFocus={() => {
            name.current?.select();
            return name.current;
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) {
              return;
            }
            event.preventDefault();
            save();
          }}
        >
          <Dialog.Header>
            <Dialog.Title>
              {draft.kind === "screenshot" ? "Save Screenshot" : "Save to Pond"}
            </Dialog.Title>
          </Dialog.Header>
          <Dialog.Close />

          <div className={styles.body}>
            <div className={styles.fields}>
              <Preview draft={draft} />
              <Rating value={rating} onValueChange={setRating} />
              <Input.Root>
                <Input.Field
                  ref={name}
                  aria-label="Name"
                  placeholder="Name"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Input.Root>
              <Input.Root>
                <Input.Textarea
                  aria-label="Description"
                  placeholder="Add a description"
                  rows={3}
                  value={notes}
                  onValueChange={setNotes}
                />
              </Input.Root>
              <Targets.Tags
                tags={library.tags}
                recent={library.recentTags}
                value={tags}
                onValueChange={setTags}
                container={container}
              />
              {library.fish.length ? (
                <Targets.Fish
                  fish={library.fish}
                  value={fishId}
                  onValueChange={setFishId}
                  container={container}
                />
              ) : null}
            </div>
            <Targets.Folders
              className={styles.folders}
              folders={library.folders}
              recentIds={library.recentFolderIds}
              value={folderIds}
              onValueChange={setFolderIds}
            />
          </div>

          <Dialog.Footer
            leading={
              <span className={styles.leading}>
                <span className={styles.library}>Saving to {library.name}</span>
                <Keyboard.Cluster
                  keys={[MAC ? "⌘" : "Ctrl", "↵"]}
                  density="inline"
                />
              </span>
            }
          >
            <Dialog.Cancel />
            <Dialog.Confirm onClick={save}>Save</Dialog.Confirm>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
