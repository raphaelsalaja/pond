import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import type { LibraryCardView } from "@/features/saves/components/card/types";
import type { RichFilePreviewKind } from "@/features/saves/lib/media/rich-file-preview";
import type { SaveFile } from "@/features/saves/types";
import { ArchiveCardPreview } from "./archive";
import { EpubCardPreview } from "./epub";
import { FontCardPreview } from "./font";
import styles from "./styles.module.css";

const ModelCardPreview = lazy(async () => {
  const module = await import("./model");
  return { default: module.ModelCardPreview };
});

interface RichFilePreviewProps {
  kind: RichFilePreviewKind;
  saveId: string;
  title: string | null;
  file: SaveFile;
  url: string;
  view?: LibraryCardView;
}

export function RichFilePreview(props: RichFilePreviewProps) {
  let preview: ReactNode;
  switch (props.kind) {
    case "model":
      preview = (
        <Suspense fallback={<PreviewStatus label="Loading model" />}>
          <ModelCardPreview
            url={props.url}
            path={props.file.path}
            view={props.view}
          />
        </Suspense>
      );
      break;
    case "epub":
      preview = (
        <EpubCardPreview
          url={props.url}
          title={props.title}
          view={props.view}
        />
      );
      break;
    case "font":
      preview = (
        <FontCardPreview
          url={props.url}
          saveId={props.saveId}
          view={props.view}
        />
      );
      break;
    case "archive":
      preview = <ArchiveCardPreview view={props.view} />;
      break;
  }
  return (
    <div className={styles.root} data-view={props.view}>
      {preview}
    </div>
  );
}

function PreviewStatus({ label }: { label: string }) {
  return (
    <div className={styles.status}>
      <span>{label}</span>
    </div>
  );
}
