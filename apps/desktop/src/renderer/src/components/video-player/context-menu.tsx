import type { useMediaRemote } from "@vidstack/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { REVEAL_LABEL } from "@/components/save-preview/helpers";
import type { Save } from "@/pool/types";
import styles from "./styles.module.css";

type MediaRemote = ReturnType<typeof useMediaRemote>;

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

interface VideoContextMenuProps {
  position: { x: number; y: number };
  save: Save;
  containerRef: React.RefObject<HTMLDivElement | null>;
  remote: MediaRemote;
  playbackRate: number;
  onClose: () => void;
}

function captureFrame(
  containerRef: React.RefObject<HTMLDivElement | null>,
): string | null {
  const container = containerRef.current;
  if (!container) return null;
  const video = container.querySelector("video");
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
    return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export function VideoContextMenu({
  position,
  save,
  containerRef,
  remote,
  playbackRate,
  onClose,
}: VideoContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [speedOpen, setSpeedOpen] = useState(false);
  const hasFiles = save.files.length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) menu.style.left = `${vw - rect.width - 8}px`;
    if (rect.bottom > vh) menu.style.top = `${vh - rect.height - 8}px`;
  }, []);

  const onCopyFrame = useCallback(async () => {
    const dataUrl = captureFrame(containerRef);
    if (!dataUrl) return;
    await window.pond.query("video.copyFrame", { dataUrl });
    onClose();
  }, [containerRef, onClose]);

  const onSaveFrame = useCallback(async () => {
    const dataUrl = captureFrame(containerRef);
    if (!dataUrl) return;
    await window.pond.query("video.saveFrame", { dataUrl });
    onClose();
  }, [containerRef, onClose]);

  const onSetThumbnail = useCallback(async () => {
    const dataUrl = captureFrame(containerRef);
    if (!dataUrl) return;
    await window.pond.query("video.setThumbnail", {
      saveId: save.id,
      dataUrl,
    });
    onClose();
  }, [containerRef, save.id, onClose]);

  const onReveal = useCallback(async () => {
    await window.pond.revealSave(save.id);
    onClose();
  }, [save.id, onClose]);

  const onOpenDefault = useCallback(async () => {
    await window.pond.openSaveFile(save.id);
    onClose();
  }, [save.id, onClose]);

  const onCopyFilePath = useCallback(async () => {
    await window.pond.query("video.copyFilePath", { saveId: save.id });
    onClose();
  }, [save.id, onClose]);

  const onPip = useCallback(() => {
    remote.enterPictureInPicture();
    onClose();
  }, [remote, onClose]);

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
      <div
        className={styles["ctx-backdrop"]}
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        className={styles["ctx-menu"]}
        style={{ left: position.x, top: position.y }}
      >
        <button
          type="button"
          className={styles["ctx-item"]}
          onClick={() => void onSetThumbnail()}
        >
          Set as Video Thumbnail
        </button>
        <button
          type="button"
          className={styles["ctx-item"]}
          onClick={() => void onCopyFrame()}
        >
          Copy Current Frame to Clipboard
          <span className={styles["menu-shortcut"]}>⌥C</span>
        </button>
        <button
          type="button"
          className={styles["ctx-item"]}
          onClick={() => void onSaveFrame()}
        >
          Save Current Frame
          <span className={styles["menu-shortcut"]}>⌥S</span>
        </button>

        <div className={styles["ctx-separator"]} />

        {/* biome-ignore lint/a11y/noStaticElementInteractions: hover submenu */}
        <div
          className={styles["ctx-submenu"]}
          onMouseEnter={() => setSpeedOpen(true)}
          onMouseLeave={() => setSpeedOpen(false)}
        >
          <button type="button" className={styles["ctx-item"]}>
            Playback Speed
            <span className={styles["menu-shortcut"]}>{playbackRate}x ›</span>
          </button>
          {speedOpen ? (
            <div className={styles["ctx-submenu-items"]}>
              {SPEED_OPTIONS.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  className={styles["ctx-item"]}
                  onClick={() => {
                    remote.changePlaybackRate(rate);
                    onClose();
                  }}
                >
                  <span className={styles["ctx-check"]}>
                    {rate === playbackRate ? "✓" : ""}
                  </span>
                  {rate}x
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className={styles["ctx-separator"]} />

        <button
          type="button"
          className={styles["ctx-item"]}
          data-disabled={!hasFiles ? "" : undefined}
          onClick={() => void onOpenDefault()}
        >
          Open with Default App
          <span className={styles["menu-shortcut"]}>⏎</span>
        </button>
        <button
          type="button"
          className={styles["ctx-item"]}
          data-disabled={!hasFiles ? "" : undefined}
          onClick={() => void onReveal()}
        >
          {REVEAL_LABEL}
          <span className={styles["menu-shortcut"]}>⌘⏎</span>
        </button>
        <button
          type="button"
          className={styles["ctx-item"]}
          data-disabled={!hasFiles ? "" : undefined}
          onClick={() => void onCopyFilePath()}
        >
          Copy File Path
          <span className={styles["menu-shortcut"]}>⌥⌘C</span>
        </button>

        <div className={styles["ctx-separator"]} />

        <button type="button" className={styles["ctx-item"]} onClick={onPip}>
          Picture-in-Picture
        </button>
      </div>
    </>
  );
}
