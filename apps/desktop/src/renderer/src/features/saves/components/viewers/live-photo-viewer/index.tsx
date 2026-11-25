import { IconImage, IconVideo } from "@pond/icons";
import JSZip from "jszip";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { ChromePortal } from "@/features/saves/components/viewers/media-viewer/chrome";
import { ViewerToolbarGroups } from "@/features/saves/components/viewers/viewer-toolbar-groups";
import styles from "./styles.module.css";

interface LivePhotoMedia {
  image: string | null;
  video: string | null;
  captions: string | null;
}

export function LivePhotoViewer({
  url,
  onUnavailable,
  toolbarStart,
  toolbarActions,
}: {
  url: string;
  onUnavailable: () => void;
  toolbarStart?: ReactNode;
  toolbarActions?: ReactNode;
}) {
  const [media, setMedia] = useState<LivePhotoMedia>({
    image: null,
    video: null,
    captions: null,
  });
  const [motion, setMotion] = useState(false);

  useEffect(() => {
    let active = true;
    const urls: Array<string> = [];
    void fetch(url)
      .then((response) => response.arrayBuffer())
      .then((buffer) => JSZip.loadAsync(buffer))
      .then(async (archive) => {
        const entries = Object.values(archive.files).filter(
          (entry) => !entry.dir,
        );
        const image = entries.find((entry) =>
          /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i.test(entry.name),
        );
        const video = entries.find((entry) =>
          /\.(m4v|mov|mp4|webm)$/i.test(entry.name),
        );
        const captions = entries.find((entry) => /\.vtt$/i.test(entry.name));
        const next: LivePhotoMedia = {
          image: null,
          video: null,
          captions: null,
        };
        if (image) {
          next.image = URL.createObjectURL(await image.async("blob"));
          urls.push(next.image);
        }
        if (video) {
          next.video = URL.createObjectURL(await video.async("blob"));
          urls.push(next.video);
        }
        if (captions) {
          next.captions = URL.createObjectURL(
            new Blob([await captions.async("string")], { type: "text/vtt" }),
          );
          urls.push(next.captions);
        }
        if (!active) {
          for (const objectUrl of urls) URL.revokeObjectURL(objectUrl);
          return;
        }
        if (!next.image && !next.video) {
          onUnavailable();
          return;
        }
        setMedia(next);
        setMotion(!next.image && Boolean(next.video));
      })
      .catch(() => {
        if (active) onUnavailable();
      });
    return () => {
      active = false;
      for (const objectUrl of urls) URL.revokeObjectURL(objectUrl);
    };
  }, [onUnavailable, url]);

  const video = media.video ? (
    // oxlint-disable-next-line jsx-a11y/media-has-caption -- imported Live Photo clips may lack captions; only a real archived WebVTT track is rendered when supplied
    <video
      className={styles.media}
      src={media.video}
      controls
      autoPlay={motion}
      loop={motion}
      aria-label="Live Photo motion"
    >
      {media.captions ? (
        <track kind="captions" src={media.captions} label="Captions" default />
      ) : null}
    </video>
  ) : null;

  return (
    <div className={styles.root}>
      {(motion || !media.image) && video ? (
        video
      ) : media.image ? (
        <img className={styles.media} src={media.image} alt="" />
      ) : (
        <div className={styles.status} role="status">
          Reading Live Photo
        </div>
      )}
      {media.image || media.video || toolbarStart || toolbarActions ? (
        <ChromePortal slot="top">
          <ViewerHud.Bar
            label="Live Photo"
            start={toolbarStart}
            center={
              <ViewerToolbarGroups
                controls={
                  media.image && media.video ? (
                    <>
                      <ViewerHud.Tool
                        label="Photo"
                        pressed={!motion}
                        onClick={() => setMotion(false)}
                      >
                        <IconImage />
                      </ViewerHud.Tool>
                      <ViewerHud.Tool
                        label="Motion"
                        pressed={motion}
                        onClick={() => setMotion(true)}
                      >
                        <IconVideo />
                      </ViewerHud.Tool>
                    </>
                  ) : null
                }
                actions={toolbarActions}
              />
            }
          />
        </ChromePortal>
      ) : null}
    </div>
  );
}
