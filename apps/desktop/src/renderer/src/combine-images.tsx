import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CombineImagesWindow } from "./app/combine-images-window";
import "./app/boot-shell";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");
createRoot(root).render(
  <StrictMode>
    <CombineImagesWindow />
  </StrictMode>,
);
