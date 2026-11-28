import { SvelteMap } from 'svelte/reactivity';
import { listSelector, type ListPosition } from './list-position';

type NavigationEntry = { scope: string; url: string; position?: ListPosition; origin?: string; focusHref?: string };

/** Owns archive-scoped navigation snapshots. Tab destinations never inherit a detail page's originating list. */
export class ListNavigation {
  private scope = Math.random().toString(36);
  private positions = new Map<string, ListPosition>();
  private tabs = new Map<string, string>();
  private origins = new SvelteMap<string, string>();
  private pending: { url: string; origin?: string } | null = null;

  reset(): void {
    this.scope = Math.random().toString(36);
    this.positions.clear();
    this.tabs.clear();
    this.origins.clear();
    this.pending = null;
  }

  private entry(url: string): NavigationEntry | undefined {
    const entry = history.state?.limethatNavigation as NavigationEntry | undefined;
    return entry?.scope === this.scope && entry.url === url ? entry : undefined;
  }

  private tab(url: string): string | undefined {
    const path = url.split('?')[0];
    if (path === '#/' || path === '#/events') return '#/events';
    if (path === '#/labels' || path === '#/settings') return path;
  }

  private write(entry: NavigationEntry): void {
    history.replaceState({ ...history.state, limethatNavigation: entry }, '');
  }

  remember(position: ListPosition, focusHref?: string): void {
    const path = position.url.slice(1).split('?')[0];
    const tab = this.tab(position.url);
    if (tab || listSelector(path)) this.positions.set(position.url, position);
    if (tab) this.tabs.set(tab, position.url);
    this.write({ ...this.entry(position.url), scope: this.scope, url: position.url, position, focusHref });
  }

  destination(href: string): string {
    return this.tabs.get(href) ?? href;
  }

  origin(url: string, fallback: string): string {
    return this.origins.get(url) ?? this.destination(fallback);
  }

  prepare(from: string, to: string): void {
    const path = from.slice(1).split('?')[0];
    const detail = /^#\/(events|labels)\/[^/?]+$/.test(to) && !to.endsWith('/new');
    this.pending = { url: to, origin: detail && listSelector(path) ? from : undefined };
  }

  position(url: string): ListPosition | undefined {
    return this.entry(url)?.position ?? this.positions.get(url);
  }

  arrive(url: string): NavigationEntry {
    const saved = this.entry(url);
    const origin = this.pending?.url === url ? this.pending.origin : saved?.origin;
    this.pending = null;
    if (origin) this.origins.set(url, origin);
    else this.origins.delete(url);
    const tab = this.tab(url);
    if (tab) this.tabs.set(tab, url);
    const entry = { scope: this.scope, url, position: this.position(url), origin, focusHref: saved?.focusHref };
    this.write(entry);
    return entry;
  }

  replaceQuery(url: string): void {
    this.positions.delete(url);
    const tab = this.tab(url);
    if (tab) this.tabs.set(tab, url);
    history.replaceState({ ...history.state, limethatNavigation: { scope: this.scope, url } }, '', url);
  }
}
