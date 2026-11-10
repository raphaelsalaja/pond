/**
 * sharp's prebuilt libvips clashes with glib in Electron's utility process on
 * Linux and segfaults on the first JPEG decode. The main process is unaffected,
 * so run image jobs there instead of losing the whole task.
 */
export function runsQueueWorkerInProcess(
  platform: NodeJS.Platform = process.platform,
  electron: string | undefined = process.versions.electron,
): boolean {
  return platform === "linux" && Boolean(electron);
}
