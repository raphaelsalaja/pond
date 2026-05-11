import { inject } from "@/sources/instagram/inject";
import { matches } from "@/sources/instagram/matches";

export default defineContentScript({
  matches,
  runAt: "document_start",
  world: "MAIN",
  globalName: false,
  main: inject,
});
