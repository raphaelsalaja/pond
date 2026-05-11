import { inject } from "@/sources/tiktok/inject";
import { matches } from "@/sources/tiktok/matches";

export default defineContentScript({
  matches,
  runAt: "document_start",
  world: "MAIN",
  globalName: false,
  main: inject,
});
