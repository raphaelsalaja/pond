import { inject } from "@/sources/arena/inject";
import { matches } from "@/sources/arena/matches";

export default defineContentScript({
  matches,
  runAt: "document_start",
  world: "MAIN",
  globalName: false,
  main: inject,
});
