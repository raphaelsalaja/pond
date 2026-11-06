export const RELAUNCH_ARG = "--pond-relaunch";

export interface RelaunchOptions {
  execPath: string;
  args: string[];
}

export function appRelaunchOptions(
  platform: NodeJS.Platform = process.platform,
  appImage = process.env.APPIMAGE,
  argv: readonly string[] = process.argv,
): RelaunchOptions | undefined {
  if (platform !== "linux" || !appImage) return undefined;
  return {
    execPath: appImage,
    args: [...argv]
      .slice(1)
      .filter((arg) => arg !== RELAUNCH_ARG)
      .concat(RELAUNCH_ARG),
  };
}
