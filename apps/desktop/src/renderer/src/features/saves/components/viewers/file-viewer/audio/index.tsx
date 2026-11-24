import {
  IconAnimationRepeat,
  IconFullScreen,
  IconMediaPause,
  IconMediaPlay,
  IconVolume,
  IconVolumeOff,
} from "@pond/icons";
import { Select, Slider } from "@pond/ui";
import { useEffect, useRef, useState } from "react";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { ChromePortal } from "@/features/saves/components/viewers/media-viewer/chrome";
import { ViewerFallback } from "@/features/saves/components/viewers/viewer-fallback";
import { estimateBpm } from "@/features/saves/lib/media/audio-bpm";
import { downsamplePeaks } from "@/features/saves/lib/media/audio-peaks";
import { formatBytes } from "@/shared/lib/format";
import { FileBar } from "../file-bar";
import { FileMark } from "../file-card";
import type { ViewerProps } from "../types";
import styles from "./styles.module.css";

export function AudioViewer(props: ViewerProps & { url: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hoverStartedRef = useRef(false);
  const [bpm, setBpm] = useState<number | null>(props.file.bpm ?? null);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState("1");
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const context = new AudioContext();
    let active = true;
    void fetch(props.url)
      .then((response) => response.arrayBuffer())
      .then((buffer) => context.decodeAudioData(buffer))
      .then((audio) => {
        if (!active) {
          return;
        }
        const samples = audio.getChannelData(0);
        const peaks = downsamplePeaks(samples, 120);
        const canvas = canvasRef.current;
        const gfx = canvas?.getContext("2d");
        if (canvas && gfx) {
          const width = canvas.width;
          const height = canvas.height;
          gfx.clearRect(0, 0, width, height);
          gfx.fillStyle = getComputedStyle(canvas).color;
          const bar = width / peaks.length;
          for (let index = 0; index < peaks.length; index += 1) {
            const magnitude = peaks[index] ?? 0;
            const barHeight = Math.max(1, magnitude * height);
            gfx.fillRect(
              index * bar,
              (height - barHeight) / 2,
              Math.max(1, bar - 1),
              barHeight,
            );
          }
        }
        const tempo = estimateBpm(samples, audio.sampleRate);
        if (tempo) {
          setBpm(tempo);
          void window.pond.query("saves.setAudioAnalysis", {
            id: props.save.id,
            bpm: tempo,
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      void context.close();
    };
  }, [props.save.id, props.url]);

  if (failed) {
    return <ViewerFallback {...props} reason="decode" active={props.active} />;
  }

  return (
    <div ref={rootRef} className={styles.root}>
      <div className={styles.card}>
        <FileMark file={props.file} />
        <div className={styles.heading}>
          <h1>{props.save.title ?? props.file.path}</h1>
          <p>
            {props.file.path} · {formatBytes(props.file.size)}
            {bpm ? ` · ${bpm} BPM` : ""}
          </p>
        </div>
        <canvas
          ref={canvasRef}
          className={styles.waveform}
          width={480}
          height={64}
          role="slider"
          tabIndex={0}
          aria-label="Waveform"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${formatAudioTime(currentTime)} of ${formatAudioTime(duration)}`}
          onKeyDown={(event) => {
            const audio = audioRef.current;
            if (!audio?.duration) {
              return;
            }
            const next = waveformSeekTarget(
              event.key,
              audio.currentTime,
              audio.duration,
            );
            if (next === null) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            audio.currentTime = next;
          }}
          onClick={(event) => {
            const audio = audioRef.current;
            if (!audio?.duration) {
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            audio.currentTime =
              ((event.clientX - rect.left) / rect.width) * audio.duration;
          }}
          onMouseEnter={() => {
            const audio = audioRef.current;
            if (audio?.paused) {
              hoverStartedRef.current = true;
              void audio.play();
            }
          }}
          onMouseLeave={() => {
            const audio = audioRef.current;
            if (audio && hoverStartedRef.current) {
              hoverStartedRef.current = false;
              audio.pause();
            }
          }}
        />
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- saved audio files carry no caption track */}
        <audio
          ref={audioRef}
          preload="metadata"
          src={props.url}
          loop={loop}
          muted={muted}
          onLoadedMetadata={(event) =>
            setDuration(event.currentTarget.duration || 0)
          }
          onTimeUpdate={(event) =>
            setCurrentTime(event.currentTarget.currentTime)
          }
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setFailed(true)}
        />
      </div>
      <FileBar {...props} />
      <ChromePortal slot="bottom">
        <ViewerHud.Pill className={styles.dock}>
          <ViewerHud.Tools
            tooltipSide="top"
            className={styles.transport}
            role="toolbar"
            aria-label="Audio playback"
          >
            <ViewerHud.Tool
              label={playing ? "Pause" : "Play"}
              onClick={() => {
                const audio = audioRef.current;
                if (!audio) {
                  return;
                }
                if (audio.paused) {
                  void audio.play();
                } else {
                  audio.pause();
                }
              }}
            >
              {playing ? <IconMediaPause /> : <IconMediaPlay />}
            </ViewerHud.Tool>
            <ViewerHud.Tool
              label={muted || volume === 0 ? "Unmute" : "Mute"}
              onClick={() => setMuted((value) => !value)}
            >
              {muted || volume === 0 ? <IconVolumeOff /> : <IconVolume />}
            </ViewerHud.Tool>
            <ViewerHud.Scale>
              {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
            </ViewerHud.Scale>
            <Slider.Root
              className={styles.progress}
              aria-label="Audio Position"
              min={0}
              max={Math.max(duration, 0.01)}
              step={0.01}
              value={currentTime}
              onValueChange={(value) => {
                const next = isValueList(value) ? (value[0] ?? 0) : value;
                setCurrentTime(next);
                if (audioRef.current) {
                  audioRef.current.currentTime = next;
                }
              }}
            >
              <Slider.Control>
                <Slider.Track>
                  <Slider.Indicator />
                  <Slider.Thumb />
                </Slider.Track>
              </Slider.Control>
            </Slider.Root>
            <Select.Root
              value={speed}
              onValueChange={(value) => {
                if (value === null) {
                  return;
                }
                setSpeed(value);
                if (audioRef.current) {
                  audioRef.current.playbackRate = Number(value);
                }
              }}
            >
              <Select.Trigger variant="chip" aria-label="Playback Speed">
                <Select.Value>{(value: string) => `${value}×`}</Select.Value>
              </Select.Trigger>
              <Select.Portal>
                <Select.Positioner sideOffset={6}>
                  <Select.Popup>
                    <Select.Items
                      items={["0.5", "0.75", "1", "1.25", "1.5", "2"].map(
                        (value) => ({ value, label: `${value}×` }),
                      )}
                    />
                  </Select.Popup>
                </Select.Positioner>
              </Select.Portal>
            </Select.Root>
            <Slider.Root
              className={styles.volume}
              aria-label="Audio Volume"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onValueChange={(value) => {
                const next = isValueList(value) ? (value[0] ?? 1) : value;
                setVolume(next);
                setMuted(false);
                if (audioRef.current) {
                  audioRef.current.volume = next;
                }
              }}
            >
              <Slider.Control>
                <Slider.Track>
                  <Slider.Indicator />
                  <Slider.Thumb />
                </Slider.Track>
              </Slider.Control>
            </Slider.Root>
            <ViewerHud.Tool
              label="Loop"
              pressed={loop}
              onClick={() => setLoop((value) => !value)}
            >
              <IconAnimationRepeat />
            </ViewerHud.Tool>
            <ViewerHud.Tool
              label="Full Screen"
              onClick={() => {
                const root = rootRef.current;
                if (!root) {
                  return;
                }
                if (document.fullscreenElement) {
                  void document.exitFullscreen();
                } else {
                  void root.requestFullscreen();
                }
              }}
            >
              <IconFullScreen />
            </ViewerHud.Tool>
          </ViewerHud.Tools>
        </ViewerHud.Pill>
      </ChromePortal>
    </div>
  );
}

const WAVEFORM_SEEK_SECONDS = 5;

function isValueList(
  value: number | ReadonlyArray<number>,
): value is ReadonlyArray<number> {
  return Array.isArray(value);
}

function waveformSeekTarget(
  key: string,
  time: number,
  duration: number,
): number | null {
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return Math.max(0, time - WAVEFORM_SEEK_SECONDS);
    case "ArrowRight":
    case "ArrowUp":
      return Math.min(duration, time + WAVEFORM_SEEK_SECONDS);
    case "Home":
      return 0;
    case "End":
      return duration;
    default:
      return null;
  }
}

function formatAudioTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0:00";
  }
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
