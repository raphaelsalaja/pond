import type { SharePageManifest } from "@pond/schema/share-page";
import { useMemo, useState } from "react";
import { KIND_LABELS, formatDate, savesCount } from "../../lib/format";
import { replaceHash, saveIdFromHash } from "../../lib/hash";
import { SaveCard } from "../save-card";
import { SaveDialog } from "../save-dialog";
import { SaveView } from "../save-view";
import styles from "./styles.module.css";

const POND_URL = "https://pond.raphaelsalaja.com";

/** Cards render in pages so a large Folder doesn't build thousands of rows before the first paint. */
export const PAGE_SIZE = 120;

export function Page({ manifest }: { manifest: SharePageManifest }) {
  const { saves } = manifest;
  const ids = useMemo(() => saves.map((save) => save.id), [saves]);
  const [openId, setOpenId] = useState(() =>
    saveIdFromHash(window.location.hash, ids),
  );
  const [shown, setShown] = useState(PAGE_SIZE);

  const open = (id: string | null) => {
    setOpenId(id);
    replaceHash(window.location, window.history, id);
  };

  const single = manifest.kind === "save" ? saves[0] : undefined;
  if (single) {
    return (
      <div className={styles.single}>
        <main>
          <SaveView save={single} heading="h1" />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{KIND_LABELS[manifest.kind]}</p>
        <h1 className={styles.title}>{manifest.title}</h1>
        <p className={styles.meta}>
          {savesCount(saves.length)} · {formatDate(manifest.createdAt)}
        </p>
      </header>
      <main>
        <ul className={styles.grid}>
          {saves.slice(0, shown).map((save) => (
            <li key={save.id} className={styles.cell}>
              <SaveCard save={save} onOpen={open} />
            </li>
          ))}
        </ul>
        {shown < saves.length ? (
          <div className={styles.more}>
            <button
              type="button"
              className={styles.moreButton}
              onClick={() => setShown((count) => count + PAGE_SIZE)}
            >
              Show More
            </button>
          </div>
        ) : null}
      </main>
      <Footer />
      <SaveDialog saves={saves} openId={openId} onOpenChange={open} />
    </div>
  );
}

export function Unreadable({ message }: { message: string }) {
  return (
    <div className={styles.single}>
      <main className={styles.unreadable}>
        <h1 className={styles.title}>Can’t Show This Page</h1>
        <p className={styles.meta}>{message}</p>
      </main>
    </div>
  );
}

function Footer() {
  return (
    <footer className={styles.footer}>
      Made with{" "}
      <a href={POND_URL} target="_blank" rel="noreferrer noopener">
        Pond
      </a>
    </footer>
  );
}
