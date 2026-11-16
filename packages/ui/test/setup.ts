import "@pond/theme/theme.css";
import "../src/reset.css";
import "../src/focus-modality";
import { afterEach } from "vitest";

afterEach(() => {
  delete document.documentElement.dataset.theme;
});
