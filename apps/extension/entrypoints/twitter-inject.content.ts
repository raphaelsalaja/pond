import { inject } from "@/sources/twitter/inject";
import { matches } from "@/sources/twitter/matches";

export default defineContentScript({
  matches,
  runAt: "document_start",
  world: "MAIN",
  globalName: false,
  main: inject,
});
