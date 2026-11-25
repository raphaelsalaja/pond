export function printPdf(url: string): void {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.src = url;
  frame.title = "Print PDF";
  frame.addEventListener(
    "load",
    () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1000);
    },
    { once: true },
  );
  document.body.append(frame);
}
