import "./styles.css";
import { createRoot } from "react-dom/client";
import { Page, Unreadable } from "./components/page";
import { followColorScheme } from "./lib/color-scheme";
import { readManifest } from "./lib/read-manifest";

followColorScheme(
  document.documentElement,
  window.matchMedia("(prefers-color-scheme: dark)"),
);

const container = document.getElementById("root");
if (container) {
  const read = readManifest(document);
  createRoot(container).render(
    read.ok ? (
      <Page manifest={read.manifest} />
    ) : (
      <Unreadable message={read.error} />
    ),
  );
}
