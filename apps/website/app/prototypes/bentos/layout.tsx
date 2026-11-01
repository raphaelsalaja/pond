import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Bento prototypes",
  description: "Temporary gallery of homepage bento card variations.",
  robots: { index: false, follow: false },
};

export default function BentosLayout({ children }: { children: ReactNode }) {
  return children;
}
