import {
  IconArrowAnticlockwiseText,
  IconCopy,
  IconFileExport,
} from "@pond/icons";
import { decodeTextBytes, type TextEncoding } from "@shared/text-encoding";
import { useEffect, useState } from "react";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { ChromePortal } from "@/features/saves/components/viewers/media-viewer/chrome";
import { OriginalFileActions } from "@/features/saves/components/viewers/original-file-actions";
import { ViewerSaveNav } from "@/features/saves/components/viewers/viewer-save-nav";
import { ViewerToolbarGroups } from "@/features/saves/components/viewers/viewer-toolbar-groups";
import type { Save, SaveFile } from "@/features/saves/types";
import { notify } from "@/shared/lib/toast";
import styles from "./styles.module.css";

export function TextFileViewer({
  save,
  file,
  fileIndex,
  url,
}: {
  save: Save;
  file: SaveFile;
  fileIndex: number;
  url: string;
  active?: boolean;
}) {
  const [text, setText] = useState("");
  const [encoding, setEncoding] = useState<TextEncoding>("utf-8");
  const [failed, setFailed] = useState(false);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    setFailed(false);
    void fetch(url, { signal: abort.signal })
      .then((response) => response.arrayBuffer())
      .then((buffer) => {
        const decoded = decodeTextBytes(new Uint8Array(buffer));
        setEncoding(decoded.encoding);
        if (/\.json$/i.test(file.path)) {
          try {
            setText(JSON.stringify(JSON.parse(decoded.text), null, 2));
            return;
          } catch {}
        }
        setText(decoded.text);
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      });
    return () => abort.abort();
  }, [file.path, url]);

  const convert = async () => {
    setConverting(true);
    try {
      const result = await window.pond.query("saves.convertTextEncoding", {
        id: save.id,
        fileIndex,
      });
      if (!result.ok) throw new Error();
      setEncoding("utf-8");
      notify({ id: "text-encoding", title: "Converted to UTF-8" });
    } catch {
      notify({
        id: "text-encoding",
        title: "Couldn't convert text",
        description: "The original file is unchanged.",
      });
    } finally {
      setConverting(false);
    }
  };
  const exportDotLottie = async () => {
    const result = await window.pond.query("saves.exportDotLottie", {
      id: save.id,
      fileIndex,
    });
    if (!result.ok && result.reason !== "cancelled")
      notify({
        id: "dotlottie-export",
        title: "Couldn't export dotLottie",
        description: result.error,
      });
  };

  return (
    <div className={styles.root}>
      <ChromePortal slot="top">
        <ViewerHud.Bar
          label="Text file"
          start={<ViewerSaveNav saveId={save.id} />}
          center={
            <ViewerToolbarGroups
              controls={
                <>
                  {encoding !== "utf-8" ? (
                    <ViewerHud.Tool
                      label={
                        converting ? "Converting to UTF-8" : "Convert to UTF-8"
                      }
                      disabled={converting}
                      onClick={() => void convert()}
                    >
                      <IconArrowAnticlockwiseText />
                    </ViewerHud.Tool>
                  ) : null}
                  {/\.json$/i.test(file.path) ? (
                    <ViewerHud.Tool
                      label="Export dotLottie"
                      onClick={() => void exportDotLottie()}
                    >
                      <IconFileExport />
                    </ViewerHud.Tool>
                  ) : null}
                  <ViewerHud.Tool
                    label="Copy Text"
                    onClick={() => void navigator.clipboard.writeText(text)}
                  >
                    <IconCopy />
                  </ViewerHud.Tool>
                </>
              }
              actions={
                <OriginalFileActions save={save} fileIndex={fileIndex} />
              }
            />
          }
        />
      </ChromePortal>
      <div className={styles.scroll} data-scroll-fade="vertical">
        {failed ? (
          <p className={styles.status}>Pond couldn't read this text file.</p>
        ) : (
          <pre>{text}</pre>
        )}
      </div>
    </div>
  );
}
