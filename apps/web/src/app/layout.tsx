import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "pond",
  description: "Your saves from across the web, in one place.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
