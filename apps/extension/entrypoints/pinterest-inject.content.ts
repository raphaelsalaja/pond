import { inject } from "@/sources/pinterest/inject";
import { matches } from "@/sources/pinterest/matches";

export default defineContentScript({
  matches,
  runAt: "document_start",
  world: "MAIN",
  globalName: false,
  main: inject,
});
