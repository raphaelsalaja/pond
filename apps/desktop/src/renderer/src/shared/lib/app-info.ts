type AppInfo = Awaited<ReturnType<typeof window.pond.appInfo>>;

let cached: AppInfo | null = null;

export function loadAppInfo(): Promise<AppInfo> {
  if (cached) return Promise.resolve(cached);
  return window.pond.appInfo().then((info) => {
    cached = info;
    return info;
  });
}
