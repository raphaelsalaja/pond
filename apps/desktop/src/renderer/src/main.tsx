import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { bootPool } from "./pool/bootstrap";
import "./styles.css";

void bootPool();

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
