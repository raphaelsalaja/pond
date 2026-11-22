import { ImageInspector } from "@/features/saves/components/viewers/image-inspector";
import { OriginalFileActions } from "@/features/saves/components/viewers/original-file-actions";
import { previewUrlFor } from "@/features/saves/lib/media/url";
import type { Save } from "@/features/saves/types";

interface GeneratedRasterViewerProps {
  save: Save;
  fileIndex: number;
  url: string;
  active: boolean;
  onError: () => void;
  onNavigate?: (id: string) => void;
  onRatio?: (ratio: number) => void;
}

export function GeneratedRasterViewer({
  save,
  fileIndex,
  url,
  active,
  onError,
  onNavigate,
  onRatio = () => {},
}: GeneratedRasterViewerProps) {
  return (
    <ImageInspector
      save={save}
      fileIndex={fileIndex}
      src={previewUrlFor(url)}
      active={active}
      edits="none"
      endActions={<OriginalFileActions save={save} fileIndex={fileIndex} />}
      onNavigate={onNavigate}
      onRatio={onRatio}
      onError={onError}
    />
  );
}
