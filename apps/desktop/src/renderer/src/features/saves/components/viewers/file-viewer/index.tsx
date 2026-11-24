import { lazy, Suspense, useCallback, useState } from "react";
import { GeneratedRasterViewer } from "@/features/saves/components/viewers/generated-raster-viewer";
import { ViewerChrome } from "@/features/saves/components/viewers/media-viewer/chrome";
import { ViewerFallback } from "@/features/saves/components/viewers/viewer-fallback";
import { ViewerSaveNav } from "@/features/saves/components/viewers/viewer-save-nav";
import { storedFileViewerKind } from "@/features/saves/lib/media/file-viewer";
import type { StoredFileViewerKind } from "@/features/saves/lib/media/file-viewer";
import { buildPondUrl } from "@/features/saves/lib/media/url";
import type { Save, SaveFile } from "@/features/saves/types";
import { FileActions, FileBar } from "./file-bar";
import { GenericFileCard } from "./file-card";
import type { ViewerProps } from "./types";
import styles from "./styles.module.css";

const PdfViewer = lazy(() =>
  import("./pdf").then((module) => ({ default: module.PdfViewer })),
);

const AudioViewer = lazy(() =>
  import("./audio").then((module) => ({ default: module.AudioViewer })),
);

const FontViewer = lazy(() =>
  import("./font").then((module) => ({ default: module.FontViewer })),
);

const ArchiveFileViewer = lazy(() =>
  import("@/features/saves/components/viewers/archive-file-viewer").then(
    (module) => ({ default: module.ArchiveFileViewer }),
  ),
);

const EpubViewer = lazy(() =>
  import("@/features/saves/components/viewers/epub-viewer").then((module) => ({
    default: module.EpubViewer,
  })),
);

const ModelViewer = lazy(() =>
  import("@/features/saves/components/viewers/model-viewer").then((module) => ({
    default: module.ModelViewer,
  })),
);

const LivePhotoViewer = lazy(() =>
  import("@/features/saves/components/viewers/live-photo-viewer").then(
    (module) => ({ default: module.LivePhotoViewer }),
  ),
);

const SafeWebViewer = lazy(() =>
  import("@/features/saves/components/viewers/safe-web-viewer").then(
    (module) => ({ default: module.SafeWebViewer }),
  ),
);

const ArticleViewer = lazy(() =>
  import("@/features/saves/components/viewers/article-viewer").then(
    (module) => ({ default: module.ArticleViewer }),
  ),
);

const TextFileViewer = lazy(() =>
  import("@/features/saves/components/viewers/text-file-viewer").then(
    (module) => ({ default: module.TextFileViewer }),
  ),
);

export function StoredFileViewer({
  save,
  file,
  showControls = true,
}: {
  save: Save;
  file: SaveFile;
  showControls?: boolean;
}) {
  return (
    <ViewerChrome enabled={showControls}>
      <Suspense fallback={<div className={styles.status}>Loading preview</div>}>
        <StoredFileContent
          key={`${save.id}:${file.path}:${file.sha256}`}
          save={save}
          file={file}
          fileIndex={save.files.indexOf(file)}
          active
        />
      </Suspense>
    </ViewerChrome>
  );
}

interface StoredFileContentProps {
  save: Save;
  file: SaveFile;
  fileIndex: number;
  url?: string;
  active?: boolean;
  viewerKind?: StoredFileViewerKind;
}

export function StoredFileContent({
  save,
  file,
  fileIndex,
  url = buildPondUrl(save.id, file),
  active = true,
  viewerKind,
}: StoredFileContentProps) {
  const kind = viewerKind ?? storedFileViewerKind(file);
  const props = { save, file, fileIndex, active };

  if (kind === "pdf") {
    return <PdfViewer {...props} url={url} />;
  }
  if (kind === "audio") {
    return <AudioViewer {...props} url={url} />;
  }
  if (kind === "font") {
    return <FontViewer {...props} url={url} />;
  }
  if (kind === "text") {
    return <TextFileViewer {...props} url={url} />;
  }
  if (kind === "native-preview") {
    return <NativePreviewViewer {...props} url={url} />;
  }
  if (kind === "model") {
    return <ModelFileViewer {...props} url={url} />;
  }
  if (kind === "epub") {
    return <EpubFileViewer {...props} url={url} />;
  }
  if (kind === "live-photo") {
    return <LivePhotoFileViewer {...props} url={url} />;
  }
  if (kind === "archive") {
    return <ArchiveViewer {...props} url={url} />;
  }
  if (kind === "safe-web") {
    return <SafeWebFileViewer {...props} url={url} />;
  }
  if (kind === "article") {
    return <ArticleFileViewer {...props} url={url} />;
  }
  return <GenericFileViewer {...props} />;
}

function GenericFileViewer({
  message,
  ...props
}: ViewerProps & { message?: string }) {
  return (
    <div className={styles.root}>
      <GenericFileCard {...props} message={message} />
      <FileBar {...props} />
    </div>
  );
}

function NativePreviewViewer(props: ViewerProps & { url: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <ViewerFallback {...props} reason="preview" active={props.active} />;
  }

  return (
    <div className={styles.preview}>
      <GeneratedRasterViewer
        save={props.save}
        fileIndex={props.fileIndex}
        url={props.url}
        active={props.active ?? true}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function ModelFileViewer(props: ViewerProps & { url: string }) {
  const [unavailable, setUnavailable] = useState(false);
  const onUnavailable = useCallback(() => setUnavailable(true), []);
  if (unavailable) {
    return <NativePreviewViewer {...props} />;
  }
  return (
    <div className={styles.preview}>
      <ModelViewer
        url={props.url}
        path={props.file.path}
        onUnavailable={onUnavailable}
        toolbarStart={<ViewerSaveNav saveId={props.save.id} />}
        toolbarActions={<FileActions {...props} />}
      />
    </div>
  );
}

function EpubFileViewer(props: ViewerProps & { url: string }) {
  const [unavailable, setUnavailable] = useState(false);
  const onUnavailable = useCallback(() => setUnavailable(true), []);
  if (unavailable) {
    return <NativePreviewViewer {...props} />;
  }
  return (
    <div className={styles.preview}>
      <EpubViewer
        url={props.url}
        onUnavailable={onUnavailable}
        toolbarStart={<ViewerSaveNav saveId={props.save.id} />}
        toolbarActions={<FileActions {...props} />}
      />
    </div>
  );
}

function ArchiveViewer(props: ViewerProps & { url: string }) {
  const [unavailable, setUnavailable] = useState(false);
  const onUnavailable = useCallback(() => setUnavailable(true), []);
  if (unavailable) {
    return <NativePreviewViewer {...props} />;
  }
  return (
    <div className={styles.preview}>
      <ArchiveFileViewer
        url={props.url}
        path={props.file.path}
        size={props.file.size}
        onUnavailable={onUnavailable}
        toolbarStart={<ViewerSaveNav saveId={props.save.id} />}
        toolbarActions={<FileActions {...props} />}
      />
    </div>
  );
}

function LivePhotoFileViewer(props: ViewerProps & { url: string }) {
  const [unavailable, setUnavailable] = useState(false);
  const onUnavailable = useCallback(() => setUnavailable(true), []);
  if (unavailable) {
    return <NativePreviewViewer {...props} />;
  }
  return (
    <div className={styles.preview}>
      <LivePhotoViewer
        url={props.url}
        onUnavailable={onUnavailable}
        toolbarStart={<ViewerSaveNav saveId={props.save.id} />}
        toolbarActions={<FileActions {...props} />}
      />
    </div>
  );
}

function SafeWebFileViewer(props: ViewerProps & { url: string }) {
  const [unavailable, setUnavailable] = useState(false);
  const onUnavailable = useCallback(() => setUnavailable(true), []);
  if (unavailable) {
    return <NativePreviewViewer {...props} />;
  }
  return (
    <div className={styles.preview}>
      <SafeWebViewer
        url={props.url}
        path={props.file.path}
        size={props.file.size}
        onUnavailable={onUnavailable}
        toolbarStart={<ViewerSaveNav saveId={props.save.id} />}
        toolbarActions={<FileActions {...props} />}
      />
    </div>
  );
}

function ArticleFileViewer(props: ViewerProps & { url: string }) {
  const [unavailable, setUnavailable] = useState(false);
  const onUnavailable = useCallback(() => setUnavailable(true), []);
  if (unavailable) {
    return <ViewerFallback {...props} reason="preview" active={props.active} />;
  }
  return (
    <div className={styles.preview}>
      <ArticleViewer
        url={props.url}
        source={props.save.source}
        fallbackUrl={props.save.url}
        onUnavailable={onUnavailable}
        toolbarStart={<ViewerSaveNav saveId={props.save.id} />}
        toolbarActions={<FileActions {...props} />}
      />
    </div>
  );
}
