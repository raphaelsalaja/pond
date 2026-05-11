import "@pond/ui/reset.css";
import "@pond/ui/theme.css";
import "./popup.css";

import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
