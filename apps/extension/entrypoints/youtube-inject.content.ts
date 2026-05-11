import { inject } from "@/sources/youtube/inject";
import { matches } from "@/sources/youtube/matches";

export default defineContentScript({
  matches,
  runAt: "document_start",
  world: "MAIN",
  globalName: false,
  main: inject,
});
