import { loadUiSounds } from "@pond/ui/sounds";
import type { PlayUiSound, UiSoundName } from "@pond/ui/sounds";
import type { FeedbackEvent } from "@shared/feedback";
import { ensureReady } from "@web-kits/audio";
import log from "electron-log/renderer";
import { getPrefsSnapshot } from "@/shared/state/prefs";

type SoundKind = UiSoundName | "toggle";

const RATE_MS = 40;
const RAPID_MS = 110;
/** A running AudioContext keeps the audio and GPU processes waking even when it is silent. */
const PARK_AFTER_MS = 3000;
const lastPlayed = new Map<SoundKind, number>();
let lastSoundAt = -Infinity;
let parkTimer: ReturnType<typeof setTimeout> | undefined;
let parking: Promise<void> | null = null;

function warnSoundFailed(cause: unknown): void {
  log.warn("[pond sounds] playing a sound failed", cause);
}

function park(context: AudioContext, delay: number): void {
  clearTimeout(parkTimer);
  parkTimer = setTimeout(() => {
    if (performance.now() - lastSoundAt < PARK_AFTER_MS) return;
    parking = context
      .suspend()
      .catch(() => {})
      .finally(() => {
        parking = null;
      });
  }, delay);
}

function ready(): Promise<AudioContext> {
  return parking ? parking.then(() => ensureReady()) : ensureReady();
}

function readyToPlay(): Promise<[AudioContext, PlayUiSound]> {
  return Promise.all([ready(), loadUiSounds()]);
}

function reduceMotion(): boolean {
  if (!("document" in globalThis)) return false;
  return (
    globalThis.document.documentElement.getAttribute("data-reduce-motion") ===
    "true"
  );
}

function soundsEnabled(interfaceSound: boolean): boolean {
  const prefs = getPrefsSnapshot();
  if (prefs?.preferences.soundsEnabled === false) return false;
  return !interfaceSound || prefs?.feedback.sounds.interface !== false;
}

function play(kind: SoundKind, name: UiSoundName, interfaceSound = true): void {
  if (reduceMotion()) return;
  if (!soundsEnabled(interfaceSound)) return;
  const now = performance.now();
  const prev = lastPlayed.get(kind) ?? 0;
  if (now - prev < RATE_MS) return;
  lastPlayed.set(kind, now);
  lastSoundAt = now;
  const volume = now - prev < RAPID_MS ? 0.7 : 1;
  void readyToPlay()
    .then(([context, playUiSound]) => {
      playUiSound(name, { volume });
      park(context, PARK_AFTER_MS);
    })
    .catch(warnSoundFailed);
}

/** Opening the audio device blocks for about 100 ms and the recordings load in their own chunk, so do both before the first click needs a sound. */
export function warmUiSounds(): void {
  if (reduceMotion() || !soundsEnabled(true)) return;
  void readyToPlay()
    .then(([context]) => park(context, 0))
    .catch(warnSoundFailed);
}

export function playUiTap(): void {
  play("tap", "tap");
}

export function playUiSoft(): void {
  play("soft", "soft");
}

export function playUiToggle(on: boolean): void {
  play("toggle", on ? "toggleOn" : "toggleOff");
}

export function playUiSuccess(): void {
  play("success", "success");
}

function playTrashThunk(): void {
  play("trash", "trash", false);
}

export function emitFeedback(
  event: Extract<FeedbackEvent, "saveDeletion" | "folderDeletion">,
): void {
  const prefs = getPrefsSnapshot();
  if (prefs?.feedback.sounds[event] !== false) {
    playTrashThunk();
  }
  void window.pond.query("feedback.emit", { event }).catch((cause: unknown) => {
    log.warn("[pond feedback] emitting feedback failed", cause);
  });
}
