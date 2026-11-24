import { useEffect, useRef, useState } from "react";
import {
  clampGifFrame,
  gifLoopRange,
  nextGifFrame,
} from "@/features/saves/lib/gif-loop";
import { viewerMemory } from "@/features/saves/lib/viewer-memory";

interface BrowserImageDecoder {
  tracks: {
    ready: Promise<void>;
    selectedTrack: { frameCount: number } | null;
  };
  decode(options: { frameIndex: number }): Promise<{ image: VideoFrame }>;
  close(): void;
}
interface BrowserImageDecoderConstructor {
  new (options: { data: ArrayBuffer; type: string }): BrowserImageDecoder;
}
declare global {
  interface Window {
    ImageDecoder?: BrowserImageDecoderConstructor;
  }
}

export function useGifPlayer(
  src: string,
  enabled: boolean,
  active: boolean,
  autoplay = true,
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [decoder, setDecoder] = useState<BrowserImageDecoder | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const [error, setError] = useState(false);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState<[number, number] | null>(() =>
    viewerMemory.loop(src),
  );
  const [loopSrc, setLoopSrc] = useState(src);
  if (src !== loopSrc) {
    setLoopSrc(src);
    setLoop(viewerMemory.loop(src));
  }
  const [syncedAutoplay, setSyncedAutoplay] = useState(autoplay);
  if (autoplay !== syncedAutoplay) {
    setSyncedAutoplay(autoplay);
    setPlaying(autoplay);
  }
  useEffect(() => {
    if (!enabled || !window.ImageDecoder) {
      return;
    }
    const abort = new AbortController();
    let current = true;
    let instance: BrowserImageDecoder | null = null;
    const load = async () => {
      const response = await fetch(src, { signal: abort.signal });
      if (!response.ok) {
        throw new Error("Couldn't load this GIF.");
      }
      const data = await response.arrayBuffer();
      if (!current || !window.ImageDecoder) {
        return;
      }
      instance = new window.ImageDecoder({ data, type: "image/gif" });
      await instance.tracks.ready;
      if (!current) {
        return;
      }
      setFrameCount(instance.tracks.selectedTrack?.frameCount ?? 0);
      setFrameIndex(0);
      setDecoder(instance);
    };
    void load().catch(() => {
      if (current) {
        setError(true);
      }
    });
    return () => {
      current = false;
      abort.abort();
      instance?.close();
    };
  }, [src, enabled]);
  useEffect(() => {
    if (!decoder || !frameCount) {
      return;
    }
    let current = true;
    let timer = 0;
    const draw = async () => {
      const started = performance.now();
      const { image } = await decoder.decode({ frameIndex });
      if (!current) {
        image.close();
        return;
      }
      const element = canvas.current;
      if (element) {
        element.width = image.displayWidth;
        element.height = image.displayHeight;
        element.getContext("2d")?.drawImage(image, 0, 0);
      }
      const duration = Math.max(10, (image.duration ?? 100_000) / 1000) / rate;
      image.close();
      if (playing && active) {
        timer = window.setTimeout(
          () => setFrameIndex((index) => nextGifFrame(index, frameCount, loop)),
          Math.max(0, duration - (performance.now() - started)),
        );
      }
    };
    void draw().catch(() => {
      if (current) {
        setError(true);
      }
    });
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [decoder, frameIndex, frameCount, playing, active, rate, loop]);
  const [clampedFor, setClampedFor] = useState({ frameCount, loop });
  if (clampedFor.frameCount !== frameCount || clampedFor.loop !== loop) {
    setClampedFor({ frameCount, loop });
    if (frameCount) {
      setFrameIndex((index) => clampGifFrame(index, frameCount, loop));
    }
  }
  return {
    canvas,
    ready: !!decoder && frameCount > 0 && !error,
    frameIndex,
    frameCount,
    playing,
    rate,
    setRate,
    loop,
    setLoopStart: () => {
      const range = gifLoopRange(frameIndex, loop?.[1] ?? frameIndex);
      setLoop(range);
      viewerMemory.setLoop(src, range);
    },
    setLoopEnd: () => {
      const range = gifLoopRange(loop?.[0] ?? frameIndex, frameIndex);
      setLoop(range);
      viewerMemory.setLoop(src, range);
    },
    resetLoop: () => {
      setLoop(null);
      viewerMemory.setLoop(src, null);
    },
    toggle: () => setPlaying((value) => !value),
    seek: (index: number) => {
      setPlaying(false);
      setFrameIndex(clampGifFrame(index, frameCount, loop));
    },
  };
}
