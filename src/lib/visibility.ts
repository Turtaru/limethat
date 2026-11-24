const callbacks = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | undefined;

export function observeVisibility(element: Element, callback: (visible: boolean) => void): () => void {
  observer ??= new IntersectionObserver(entries => {
    for (const entry of entries) callbacks.get(entry.target)?.(entry.isIntersecting);
  }, { rootMargin: '600px' });
  callbacks.set(element, callback);
  observer.observe(element);
  return () => {
    observer?.unobserve(element);
    callbacks.delete(element);
    if (!callbacks.size) { observer?.disconnect(); observer = undefined; }
  };
}
