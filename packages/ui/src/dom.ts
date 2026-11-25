/** DOM type guards that work across realms, where `instanceof` fails for iframes and extension worlds. */

type Target = EventTarget | null | undefined;

const XHTML = "http://www.w3.org/1999/xhtml";

export function isNode(target: Target): target is Node {
  return target !== null && target !== undefined && "nodeType" in target;
}

export function isElement(target: Target): target is Element {
  return isNode(target) && target.nodeType === Node.ELEMENT_NODE;
}

export function isHTMLElement(target: Target): target is HTMLElement {
  return isElement(target) && target.namespaceURI === XHTML;
}

export function isHTMLTag<K extends keyof HTMLElementTagNameMap>(
  target: Target,
  tag: K,
): target is HTMLElementTagNameMap[K] {
  return isHTMLElement(target) && target.localName === tag;
}

export function isShadowRoot(target: Target): target is ShadowRoot {
  return (
    isNode(target) &&
    target.nodeType === Node.DOCUMENT_FRAGMENT_NODE &&
    "host" in target
  );
}
