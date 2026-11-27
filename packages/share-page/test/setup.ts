/**
 * jsdom has `<dialog>` but not its modal methods. These follow the HTML spec's observable
 * contract: `showModal()` sets `open`, `close()` clears it and fires `close`.
 */
if (!("showModal" in HTMLDialogElement.prototype)) {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      if (this.open) return;
      this.setAttribute("open", "");
    },
  });
}
if (!("close" in HTMLDialogElement.prototype)) {
  Object.assign(HTMLDialogElement.prototype, {
    close(this: HTMLDialogElement) {
      if (!this.open) return;
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export {};
