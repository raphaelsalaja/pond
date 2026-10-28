import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/links";
import { Footer } from "./components/footer";
import { Frame } from "./components/frame";
import { Nav } from "./components/nav";
import { Sounds } from "./components/sounds";
import { Splash } from "./components/splash";
import "./globals.css";

const TITLE = "Pond";
const DESCRIPTION =
  "Pond 2.0 keeps what you save on X, Instagram, Pinterest, and 15 more sources in a folder on your Mac or Windows PC. Search it, sort it, and ask your fish about it. Free and open source.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · Pond",
  },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Splash />
        <Sounds />
        <Nav />
        <Frame.Root>
          {children}
          <Footer />
        </Frame.Root>
      </body>
    </html>
  );
}
