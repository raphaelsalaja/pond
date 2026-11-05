/**
 * Electron's `quitAndInstall` closes every window before `before-quit`, then
 * Squirrel terminates the process once. A `before-quit` handler that calls
 * `preventDefault` cancels that termination, and Squirrel does not try again.
 * A window `close` handler can also cancel the close while the app is not yet
 * quitting, so the native install never starts. The hand-off therefore
 * finishes shutdown first, lets the caller reply, and only then installs.
 * The exit watchdog is armed before shutdown so a hung flush cannot leave the
 * process alive. ShipIt installs only after this process exits.
 */
export const UPDATE_RESTART_EXIT_MS = 60_000;

interface UpdateRestartDeps {
  armWatchdog(): void;
  prepare(): Promise<void>;
  schedule(task: () => void): void;
  quitAndInstall(): void;
}

let prepareForUpdateInstall: () => Promise<void> = async () => {};

export function setUpdateInstallPreparation(
  prepare: () => Promise<void>,
): void {
  prepareForUpdateInstall = prepare;
}

export function prepareApplicationForUpdateInstall(): Promise<void> {
  return prepareForUpdateInstall();
}

export async function runUpdateRestart(deps: UpdateRestartDeps): Promise<void> {
  deps.armWatchdog();
  await deps.prepare();
  deps.schedule(deps.quitAndInstall);
}
