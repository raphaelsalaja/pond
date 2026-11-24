import { tmpdir } from "node:os";

export const app = {
  getPath: () => tmpdir(),
  getVersion: () => "0.0.0",
  isPackaged: false,
};
export const shell = {};
export const session = {};
export const net = {};
/** Tests open no windows, so main-process broadcasts reach none. */
export class BrowserWindow {
  static getAllWindows(): Array<BrowserWindow> {
    return [];
  }
  isDestroyed(): boolean {
    return true;
  }
}
/** Tests have no notification center, so feedback falls back to silence. */
export class Notification {
  static isSupported(): boolean {
    return false;
  }
  show(): void {}
}
export default {};
