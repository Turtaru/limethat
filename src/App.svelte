<script lang="ts">
  import { flushSync, onMount, setContext, tick } from 'svelte';
  import Router, { router, push } from 'svelte-spa-router';
  import { AppShell } from './lib/ui-kit';
  import { Session, sessionKey } from './features/session.svelte';
  import Events from './features/Events.svelte';
  import EventList from './features/EventList.svelte';
  import { eventListNavigation, type EventListPosition } from './features/event-list-navigation.svelte';
  import { eventPhotoTransition, loadedThumbnails } from './features/event-photo-transition.svelte';
  import Labels from './features/Labels.svelte';
  import Settings from './features/Settings.svelte';
  import Welcome from './features/Welcome.svelte';
  import NotFound from './features/NotFound.svelte';
  import Connection from './features/Connection.svelte';
  import Editors from './features/Editors.svelte';
  import PictureViewer from './features/PictureViewer.svelte';
  import AppDock from './features/AppDock.svelte';
  import { labelKey } from './lib/archive-format';
  import { installation, pwa, startPwa } from './features/pwa.svelte';
  const session = new Session();
  setContext(sessionKey, session);
  const routes = { '/': Events, '/events': Events, '/events/new': Editors, '/events/:id/edit': Editors, '/events/:id': Events, '/labels': Labels, '/labels/new': Editors, '/labels/:id/edit': Editors, '/labels/:id': Labels, '/settings': Settings, '*': NotFound };
  const eventListRoute = $derived(router.location === '/' || router.location === '/events');
  const editorRoute = $derived(/^\/(events|labels)\/(new|[^/]+\/edit)$/.test(router.location));
  let previousArchive: FileSystemDirectoryHandle | null = null;
  const section = $derived(router.location.startsWith('/labels') ? 'labels' : router.location === '/settings' ? 'settings' : 'events');
  const recordId = $derived(router.params && !Array.isArray(router.params) ? router.params.id : undefined);
  const currentEvent = $derived(session.workspace.summary?.events.find(event => event.id.toLowerCase() === recordId?.toLowerCase()));
  const currentLabel = $derived(session.workspace.summary?.labels.find(label => labelKey(label.id) === recordId));
  let photoTransition: ViewTransition | null = null;
  let returnRouteReady: (() => void) | null = null;
  function canAnimatePicture(source: HTMLElement | null): source is HTMLElement {
    const image = source?.querySelector('img');
    if (!document.startViewTransition || photoTransition || matchMedia('(prefers-reduced-motion: reduce)').matches
      || !source || !loadedThumbnails.has(source) || !image?.complete || !image.naturalWidth
      || getComputedStyle(image).visibility !== 'visible' || image.getAnimations().some(animation => animation.playState === 'running')) return false;
    const bounds = source.getBoundingClientRect();
    return bounds.bottom > 0 && bounds.top < window.innerHeight;
  }
  function animateEvent(source: HTMLElement, title: HTMLElement | null, eventId: string, update: () => void | Promise<unknown>, returning = false) {
    const ready = new Promise<boolean>(resolve => { eventPhotoTransition.ready = () => resolve(true); });
    const routeReady = returning ? new Promise<void>(resolve => { returnRouteReady = resolve; }) : Promise.resolve();
    let destinationTitle: HTMLElement | null = null;
    flushSync(() => {
      eventPhotoTransition.file = loadedThumbnails.get(source)!;
      eventPhotoTransition.name = source.dataset.pictureName ?? null;
      eventPhotoTransition.returning = returning;
      eventPhotoTransition.eventId = eventId;
    });
    source.style.viewTransitionName = 'event-photo';
    if (title) title.style.viewTransitionName = 'event-title';
    document.documentElement.classList.add('ui-photo-transition');
    const transition = document.startViewTransition(async () => {
      source.style.viewTransitionName = 'none';
      if (title) title.style.viewTransitionName = 'none';
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await update();
        const loaded = await Promise.race([Promise.all([ready, routeReady]).then(() => true), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 80); })]);
        if (!loaded) transition.skipTransition();
        if (returning && loaded) {
          const item = document.getElementById(`event-${eventId}`);
          destinationTitle = item?.querySelector<HTMLElement>('.ui-event-card__title') ?? null;
          const bounds = item?.querySelector('.ui-archive-picture')?.getBoundingClientRect();
          if (!item || item.closest('[inert]') || !bounds || bounds.bottom <= 0 || bounds.top >= window.innerHeight) transition.skipTransition();
          else if (destinationTitle) destinationTitle.style.viewTransitionName = 'event-title';
        }
        await tick();
      } finally { clearTimeout(timer); }
    });
    photoTransition = transition;
    const cleanup = () => {
      source.style.viewTransitionName = 'none';
      if (title) title.style.viewTransitionName = 'none';
      if (destinationTitle) destinationTitle.style.viewTransitionName = 'none';
      eventPhotoTransition.eventId = null;
      eventPhotoTransition.ready = null;
      eventPhotoTransition.file = null;
      eventPhotoTransition.name = null;
      eventPhotoTransition.returning = false;
      returnRouteReady = null;
      document.documentElement.classList.remove('ui-photo-transition');
      photoTransition = null;
    };
    void transition.ready.catch(() => {});
    void transition.finished.then(cleanup, cleanup);
  }
  function returnToList(href: string, update: () => void | Promise<unknown>): boolean {
    const position = pendingListPosition ?? history.state?.limethatEventList ?? eventListNavigation.position;
    const source = document.querySelector<HTMLElement>('main .ui-detail-media .ui-archive-picture');
    if (!/^#\/(?:events)?(?:\?|$)/.test(href) || !currentEvent || editorRoute
      || !router.location.startsWith('/events/') || !position || position.url !== href
      || !document.getElementById(`event-${currentEvent.id}`) || !canAnimatePicture(source)) return false;
    pendingListPosition = position;
    animateEvent(source, document.querySelector<HTMLElement>('main h1.ui-detail-title'), currentEvent.id, update, true);
    return true;
  }
  function followLink(href: string, anchor: HTMLAnchorElement) {
    if (photoTransition) { photoTransition.skipTransition(); void push(href); return; }
    if (anchor.hasAttribute('data-restore-event-list') && returnToList(href, () => push(href))) return;
    const source = eventListRoute ? anchor.querySelector<HTMLElement>('.ui-archive-picture') : null;
    const event = source ? session.workspace.summary?.events.find(item => `#/events/${encodeURIComponent(item.id)}` === href) : null;
    if (event && canAnimatePicture(source)) animateEvent(source, anchor.querySelector<HTMLElement>('.ui-event-card__title'), event.id, () => push(href));
    else void push(href);
  }
  function dockAction() {
    if (section === 'settings') void session.refresh();
    else if (section === 'labels') session.editLabel(currentLabel ?? null);
    else session.editEvent(currentEvent ?? null);
  }
  onMount(() => {
    if (import.meta.env.MODE === 'framing') return;
    try { session.theme = localStorage.getItem('limethat-theme') === 'light' ? 'light' : 'dark'; } catch { /* Theme persistence is optional. */ }
    const stopInstallation = installation.watch();
    void session.workspace.restore();
    void startPwa();
    const online = () => { pwa.online = navigator.onLine; };
    online();
    window.addEventListener('online', online); window.addEventListener('offline', online);
    const unload = (event: BeforeUnloadEvent) => {
      if (session.draftCount || session.workspace.operation) { event.preventDefault(); event.returnValue = ''; }
    };
    const navigate = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      const href = anchor?.getAttribute('href');
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !href?.startsWith('#/') || !anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      event.preventDefault();
      if (router.location === '/events' || router.location === '/') {
        const items = document.querySelectorAll<HTMLElement>('.ui-timeline > li');
        const visible = anchor.closest<HTMLElement>('.ui-timeline > li')
          ?? Array.from(items).find(item => item.getBoundingClientRect().bottom > 160);
        eventListNavigation.position = {
          url: window.location.hash || '#/', y: window.scrollY,
          eventId: visible?.id, offset: visible?.getBoundingClientRect().top, focusHref: href,
        };
        history.replaceState({ ...history.state, limethatEventList: { ...eventListNavigation.position } }, '');
      }
      if (anchor.hasAttribute('data-restore-event-list')) pendingListPosition = eventListNavigation.position;
      history.replaceState({ ...history.state, limethatFocus: href }, '');
      followLink(href, anchor);
    };
    // Start history snapshots at popstate, before traversal scroll restoration and the router's hashchange update.
    let replayingHashChange = false;
    let heldHash: string | null = null;
    const historyNavigation = () => {
      if (photoTransition) return;
      const href = window.location.hash || '#/';
      if (returnToList(href, () => {
        if ((window.location.hash || '#/') !== href) { heldHash = null; photoTransition?.skipTransition(); return; }
        replayingHashChange = true;
        try { window.dispatchEvent(new Event('hashchange')); }
        finally { replayingHashChange = false; }
      })) heldHash = href;
    };
    const holdRouterUpdate = (event: HashChangeEvent) => {
      if (replayingHashChange || heldHash !== (window.location.hash || '#/')) return;
      heldHash = null;
      event.stopImmediatePropagation();
    };
    window.addEventListener('popstate', historyNavigation, true);
    window.addEventListener('hashchange', holdRouterUpdate, true);
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', navigate);
    return () => { stopInstallation(); window.removeEventListener('online', online); window.removeEventListener('offline', online); window.removeEventListener('popstate', historyNavigation, true); window.removeEventListener('hashchange', holdRouterUpdate, true); window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate); photoTransition?.skipTransition(); };
  });
  $effect(() => {
    document.documentElement.dataset.theme = session.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', session.theme === 'light' ? '#eff3ed' : '#171b18');
  });
  $effect(() => {
    const archive = session.workspace.archive;
    if (!archive) { previousArchive = null; return; }
    if (archive.root !== previousArchive) {
      previousArchive = archive.root;
      eventListNavigation.position = null;
      pendingListPosition = null;
      history.replaceState({ ...history.state, limethatEventList: undefined }, '');
      session.reviewRequired = false;
      session.notice = `Opened ${archive.root.name}.`;
    }
  });
  let pendingListPosition: EventListPosition | null = null;
  let routeLoadedOnce = false;
  async function routeLoaded() {
    if (!routeLoadedOnce) { routeLoadedOnce = true; return; }
    await tick();
    const location = window.location.hash || '#/';
    const position = pendingListPosition ?? history.state?.limethatEventList as EventListPosition | undefined;
    pendingListPosition = null;
    if (position && position.url === location && (router.location === '/events' || router.location === '/')) {
      // View transitions pause painting, so waiting for an animation frame here can stall the return snapshot.
      if (!returnRouteReady) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if ((window.location.hash || '#/') !== location) return;
      const item = position.eventId ? document.getElementById(position.eventId) : null;
      window.scrollTo(0, item && position.offset !== undefined
        ? window.scrollY + item.getBoundingClientRect().top - position.offset : position.y);
      history.replaceState({ ...history.state, limethatEventList: { ...position } }, '');
      const href = position.focusHref;
      const link = href ? document.querySelector<HTMLElement>(`main a[href="${CSS.escape(href)}"]`) : null;
      (link ?? item?.querySelector<HTMLElement>('a'))?.focus({ preventScroll: true });
      returnRouteReady?.();
      return;
    }
    const saved = history.state?.limethatFocus as string | undefined;
    const target = saved ? Array.from(document.querySelectorAll<HTMLElement>(`main a[href="${CSS.escape(saved)}"]`))
      .find(link => !link.closest('[inert]')) : null;
    (target ?? document.querySelector<HTMLElement>('main h1.ui-detail-title[tabindex]') ?? document.querySelector<HTMLElement>('main'))?.focus({ preventScroll: true });
    returnRouteReady?.();
  }
</script>

{#if import.meta.env.MODE === 'framing'}
  <main><h1>Limethat image framing harness</h1>{#await import('./dev/ImageFrameHarness.svelte') then { default: Harness }}<Harness />{/await}</main>
{:else if !session.workspace.summary && !session.workspace.translationRecovery}
  <Welcome />
{:else}
  <AppShell>
    {#snippet footer()}
      {#if !editorRoute}<AppDock {section} label={section === 'settings' ? 'Refresh archive' : `${(section === 'labels' ? currentLabel : currentEvent) ? 'Edit' : 'Create'} ${section === 'labels' ? 'label' : 'event'}`} icon={section === 'settings' ? 'reset' : (section === 'labels' ? currentLabel : currentEvent) ? 'edit' : 'create'} disabled={section === 'settings' ? !!session.workspace.operation || !session.workspace.capability.supported : !session.canWrite} onclick={dockAction} />{/if}
    {/snippet}
    <div class="ui-stack">
      {#if session.notice}<p class={session.workspace.state === 'ready' ? 'ui-sr-only' : 'ui-status'} role="status">{session.notice}</p>{/if}
      {#if !session.workspace.translationRecovery && router.location !== '/settings' && (session.workspace.state !== 'ready' || session.reviewRequired || session.workspace.persistenceWarning)}<Connection />{/if}
      {#if session.workspace.summary}
        {#if session.workspace.summary.unreadableEvents.length}<div class="ui-error" role="alert"><p>{session.workspace.summary.unreadableEvents.length} unreadable events; they are not included below. Label rename/delete is blocked until resolved.</p><ul>{#each session.workspace.summary.unreadableEvents as item}<li><code>{item.path}</code>: {item.message}</li>{/each}</ul></div>{/if}
      {/if}
      {#if session.workspace.translationRecovery}
        <Settings />
      {:else}
        <div class="ui-route-views">
          {#key session.workspace.archive?.root}
            <EventList active={eventListRoute} />
          {/key}
          <Router {routes} restoreScrollState onRouteLoaded={routeLoaded} />
        </div>
      {/if}
    </div>
  </AppShell>
  <PictureViewer />
{/if}
