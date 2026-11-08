import { Button } from "@pond/ui";
import type {
  DownloadRequest,
  DownloadSingleProbe,
} from "@shared/downloader-contracts";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Editor, useEditor } from "../editor";
import { ExportDialog } from "../export-dialog";
import { clipOf } from "../lib/clip";
import styles from "./styles.module.css";

const FRAME_COUNT = 12;

interface SinglePageProps {
  probe: DownloadSingleProbe;
  request: DownloadRequest;
  onRequestChange: (patch: Partial<DownloadRequest>) => void;
}

export function SinglePage({
  probe,
  request,
  onRequestChange,
}: SinglePageProps) {
  const [exporting, setExporting] = useState(false);
  const duration = probe.duration;
  const trimmable = duration != null && duration >= 2 && !probe.isLive;

  const frames = useQuery({
    queryKey: ["downloader.frames", probe.url],
    enabled:
      trimmable &&
      !probe.preview &&
      !probe.storyboard &&
      probe.videoOptions.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () =>
      (
        await window.pond.query("downloader.frames", {
          url: probe.url,
          count: FRAME_COUNT,
        })
      ).frames,
  });

  const clip = clipOf(
    probe,
    (frames.data ?? []).filter((frame): frame is string => !!frame),
    request,
    onRequestChange,
  );
  const editor = useEditor(clip);
  const download = (
    <Button size="md" variant="primary" onClick={() => setExporting(true)}>
      Download
    </Button>
  );

  return (
    <Editor.Root editor={editor}>
      <Editor.Screen editor={editor} />
      <Editor.Panel>
        {trimmable ? (
          <>
            <Editor.Controls editor={editor} aside={download} />
            <Editor.Dock editor={editor} />
          </>
        ) : (
          <div className={styles.bar}>{download}</div>
        )}
      </Editor.Panel>
      <ExportDialog clip={clip} open={exporting} onOpenChange={setExporting} />
    </Editor.Root>
  );
}
