import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { bootPool } from "./pool/bootstrap";
import "./styles.css";

// Kick the pool boot the moment the renderer JS starts evaluating so
// the IndexedDB read is in flight (and usually settled) by the time
// React's first effect would have fired the IPC under the old gated
// flow. The library paints from cache on frame 1; the IPC reconcile
// quietly applies any drift in the background.
void bootPool();

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
