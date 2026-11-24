import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MissingLibraryWindow } from "./app/missing-library-window";
import "./styles.css";

/** No Library is open yet, so there are no prefs to read; follow the system appearance. */
const scheme = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => {
  const theme = scheme.matches ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.classList.toggle("light", theme === "light");
};
applyTheme();
scheme.addEventListener("change", applyTheme);
document.documentElement.setAttribute(
  "data-platform",
  /Mac/i.test(navigator.userAgent) ? "mac" : "other",
);

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root element missing");
}
createRoot(root).render(
  <StrictMode>
    <MissingLibraryWindow />
  </StrictMode>,
);
