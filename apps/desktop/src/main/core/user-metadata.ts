import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeBundleJson } from "../lib/library-config";
import { saveDir } from "../paths";

function preserveUserTitle(id: string): void {
  writeBundleJson(join(saveDir(id), "user-title.json"), { locked: true });
}
export function hasUserTitle(id: string): boolean {
  return existsSync(join(saveDir(id), "user-title.json"));
}

export function setUserTitleLock(id: string, locked: boolean): void {
  if (locked) preserveUserTitle(id);
  else rmSync(join(saveDir(id), "user-title.json"), { force: true });
}
