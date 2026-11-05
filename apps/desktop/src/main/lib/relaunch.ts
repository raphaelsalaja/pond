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
  return { execPath: appImage, args: [...argv].slice(1) };
}
