"use client";

import { Button } from "@pond/ui";
import { usePlatform } from "@/lib/platform";
import { primaryDownload } from "@/lib/release";

/** The visitor's platform is only known on the client, so the label settles after hydration. */
export function DownloadButton() {
  const download = primaryDownload(usePlatform());
  return (
    <Button nativeButton={false} render={<a href={download.href} />}>
      {download.label}
    </Button>
  );
}
