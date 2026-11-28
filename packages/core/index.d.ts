export interface AudioMatch {
  bitErrorRate: number;
  offsetSeconds: number;
}

export interface VideoMatch {
  matchedFrames: number;
  comparedFrames: number;
  offsetSeconds: number;
}

export interface NativeCore {
  /** Runs the duplicate engine on a JSON snapshot and returns `{ pairs, groups }` as JSON, on the calling thread. */
  matchLibraryJson(input: string): string;
  /** Same as `matchLibraryJson`, on a libuv worker thread. */
  matchLibrary(input: string): Promise<string>;
  /** Encoded `image-dhash` print, 16 bytes. */
  imagePrintFromGray(pixels: Uint8Array, width: number, height: number): Buffer;
  /** Encoded `audio-print`. */
  audioPrintFromSamples(samples: Float32Array, durationSeconds: number): Buffer;
  /** Encoded `video-dhash-seq` print from concatenated 9×8 greyscale frames. */
  videoPrintFromFrames(
    durationSeconds: number,
    intervalSeconds: number,
    frames: Uint8Array,
  ): Buffer;
  compareAudioPrints(left: Uint8Array, right: Uint8Array): AudioMatch | null;
  compareVideoPrints(left: Uint8Array, right: Uint8Array): VideoMatch | null;
}

export declare const nativeCore: NativeCore | null;
