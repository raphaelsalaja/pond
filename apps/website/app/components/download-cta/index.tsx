"use client";

import { usePlatform } from "@/lib/platform";
import { primaryDownload } from "@/lib/release";
import { Cta } from "../cta";

interface DownloadCtaProps {
  size?: "md" | "lg";
  className?: string;
}

/** The visitor's platform is only known on the client, so the label settles after hydration. */
export function DownloadCta({ size = "lg", className }: DownloadCtaProps) {
  const download = primaryDownload(usePlatform());
  return (
    <Cta href={download.href} size={size} className={className}>
      {download.label}
    </Cta>
  );
}
