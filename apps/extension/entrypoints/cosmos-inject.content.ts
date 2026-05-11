import { inject } from "@/sources/cosmos/inject";
import { matches } from "@/sources/cosmos/matches";

export default defineContentScript({
  matches,
  runAt: "document_start",
  world: "MAIN",
  globalName: false,
  main: inject,
});
