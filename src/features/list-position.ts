export type ListPosition = { url: string; y: number; eventId?: string; itemHref?: string; offset?: number; focusHref?: string };

export function listSelector(path: string): string | null {
  if (path === '/' || path === '/events' || /^\/labels\/[^/]+$/.test(path) && path !== '/labels/new') return '.ui-timeline > li';
  if (path === '/labels') return '.ui-label-list > li';
  return null;
}

export function captureListPosition(selector: string, focusHref?: string, anchor?: Element | null): ListPosition {
  const items = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(item => !item.closest('[inert]'));
  const item = anchor?.closest<HTMLElement>(selector) ?? items.find(item => item.getBoundingClientRect().bottom > 160);
  return {
    url: window.location.hash || '#/', y: window.scrollY,
    eventId: item?.id, itemHref: item?.querySelector('a')?.getAttribute('href') ?? undefined,
    offset: item?.getBoundingClientRect().top, focusHref,
  };
}

export function restoreListPosition(position: ListPosition): HTMLElement | null {
  let item = position.eventId ? document.getElementById(position.eventId) : null;
  if (!item || item.closest('[inert]')) {
    const link = position.itemHref ? Array.from(document.querySelectorAll<HTMLAnchorElement>('main a'))
      .find(link => link.getAttribute('href') === position.itemHref && !link.closest('[inert]')) : null;
    item = link?.closest<HTMLElement>('li') ?? null;
  }
  const bounds = item?.getBoundingClientRect();
  const top = bounds && position.offset !== undefined ? window.scrollY + bounds.top - position.offset : position.y;
  if (window.scrollY !== top || window.scrollX !== 0) window.scrollTo({ left: 0, top, behavior: 'instant' });
  return item;
}
