import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Frame } from "./components/frame";

export const metadata: Metadata = {
  title: {
    default: "Design System · Pond",
    template: "%s · Pond Design",
  },
  description: "Components and tokens from Pond UI, in Light and Dark.",
};

export default function DesignLayout({ children }: { children: ReactNode }) {
  return <Frame>{children}</Frame>;
}
