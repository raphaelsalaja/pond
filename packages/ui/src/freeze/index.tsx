import * as React from "react";

interface ElementObserverLike {
  observe(element: Element): void;
  unobserve(element: Element): void;
  disconnect(): void;
}

interface FragmentInstance {
  observeUsing(observer: ElementObserverLike): void;
  unobserveUsing(observer: ElementObserverLike): void;
}

interface FreezeProps {
  frozen: boolean;
  children: React.ReactNode;
}

export function Freeze({ frozen, children }: FreezeProps) {
  const elementsRef = React.useRef<Set<HTMLElement>>(new Set());

  const fragmentRef = React.useCallback((instance: FragmentInstance | null) => {
    if (!instance) return;
    const observer = new ElementsObserver(elementsRef);
    instance.observeUsing(observer);
    return () => {
      instance.unobserveUsing(observer);
    };
  }, []);

  React.useInsertionEffect(() => {
    if (!frozen) return;
    for (const element of elementsRef.current) {
      element.style.display = "";
    }
  }, [frozen]);

  return (
    <FragmentWithRef ref={fragmentRef}>
      <React.Suspense>
        {frozen ? <Suspend /> : null}
        {children}
      </React.Suspense>
    </FragmentWithRef>
  );
}

const FragmentWithRef = React.Fragment as unknown as (props: {
  ref?: React.RefCallback<FragmentInstance>;
  children?: React.ReactNode;
}) => React.ReactElement;

class ElementsObserver implements ElementObserverLike {
  private readonly elementsRef: React.RefObject<Set<HTMLElement>>;

  constructor(elementsRef: React.RefObject<Set<HTMLElement>>) {
    this.elementsRef = elementsRef;
  }

  observe(element: Element) {
    if (element instanceof HTMLElement) {
      this.elementsRef.current.add(element);
    }
  }

  unobserve(element: Element) {
    if (element instanceof HTMLElement) {
      this.elementsRef.current.delete(element);
    }
  }

  disconnect() {
    this.elementsRef.current.clear();
  }
}

const infinitePromise = new Promise<never>(() => {});

function Suspend(): null {
  React.use(infinitePromise);
  return null;
}
