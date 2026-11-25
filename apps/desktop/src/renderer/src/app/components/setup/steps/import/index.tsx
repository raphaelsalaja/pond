import {
  IconDownload,
  IconFile,
  IconFolderImport,
  IconGlobe,
} from "@pond/icons";
import { Button, ContentRow, Loader } from "@pond/ui";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  importBookmarks,
  importDataExport,
  importEagle,
  importEaglePackage,
  importLegacyLibrary,
  importMymind,
  importPaths,
  importPondPackage,
  runNewAction,
} from "@/features/library/components/new-menu/actions";
import styles from "./styles.module.css";

interface ImportSource {
  id: string;
  title: string;
  run: () => Promise<void>;
}

interface FeaturedSource extends ImportSource {
  description: string;
  icon: ReactNode;
}

const FEATURED: ReadonlyArray<FeaturedSource> = [
  {
    id: "eagle",
    title: "Eagle Library",
    description: "Folders, tags, notes, and ratings come along.",
    icon: <IconDownload />,
    run: importEagle,
  },
  {
    id: "mymind",
    title: "mymind",
    description: "Your cards come with their tags and notes.",
    icon: <IconFolderImport />,
    run: importMymind,
  },
  {
    id: "bookmarks",
    title: "Bookmarks",
    description: "Any browser's HTML export. Folders stay intact.",
    icon: <IconGlobe />,
    run: importBookmarks,
  },
  {
    id: "files",
    title: "Files",
    description: "Images, videos, PDFs, and anything else.",
    icon: <IconFile />,
    run: () => importPaths("files"),
  },
];

const MORE: ReadonlyArray<ImportSource> = [
  { id: "data-export", title: "Data Export", run: importDataExport },
  { id: "folders", title: "Folders", run: () => importPaths("folders") },
  { id: "eagle-package", title: "Eagle Package", run: importEaglePackage },
  { id: "pond-package", title: "Pond Package", run: importPondPackage },
  ...(["ArtStation", "Huaban", "Pixave", "Inboard"] as const).map((source) => ({
    id: source.toLowerCase(),
    title: source,
    run: () => importLegacyLibrary(source),
  })),
];

export function Imports() {
  const [running, setRunning] = useState<ReadonlySet<string>>(new Set());

  const start = async ({ id, run }: ImportSource) => {
    if (running.has(id)) return;
    setRunning((current) => new Set(current).add(id));
    await runNewAction(run);
    setRunning((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  return (
    <div className={styles.root}>
      <div className={styles.featured}>
        {FEATURED.map((source) => {
          const busy = running.has(source.id);
          return (
            <Button
              key={source.id}
              variant="bare"
              width="full"
              className={styles.card}
              aria-label={`Import ${source.title}`}
              aria-busy={busy || undefined}
              disabled={busy}
              onClick={() => void start(source)}
            >
              <ContentRow.Media className={styles.icon}>
                {source.icon}
              </ContentRow.Media>
              <ContentRow.Content>
                <ContentRow.Title>{source.title}</ContentRow.Title>
                <ContentRow.Description>
                  {source.description}
                </ContentRow.Description>
              </ContentRow.Content>
              {busy ? <Loader.Spinner className={styles.spinner} /> : null}
            </Button>
          );
        })}
      </div>
      <div className={styles.more}>
        <span className={styles.label}>Also from</span>
        {MORE.map((source) => (
          <Button
            key={source.id}
            size="sm"
            variant="secondary"
            loading={running.has(source.id)}
            aria-label={`Import ${source.title}`}
            onClick={() => void start(source)}
          >
            {source.title}
          </Button>
        ))}
      </div>
    </div>
  );
}
