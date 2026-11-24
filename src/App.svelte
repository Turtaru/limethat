<script lang="ts">
  import { flushSync, onMount, setContext, tick } from 'svelte';
  import Router, { router, push } from 'svelte-spa-router';
  import { AppShell } from './lib/ui-kit';
  import { Session, sessionKey } from './features/session.svelte';
  import Events from './features/Events.svelte';
  import EventList from './features/EventList.svelte';
  import LabelList from './features/LabelList.svelte';
  import { labelHref } from './features/models';
  import { eventListNavigation, labelListNavigation, type EventListPosition } from './features/event-list-navigation.svelte';
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
  let activeEventTransition: ViewTransition | null = null;
  let transitionRouteReady: (() => void) | null = null;
  function canAnimateElement(element: HTMLElement | null): element is HTMLElement {
    if (!document.startViewTransition || activeEventTransition || matchMedia('(prefers-reduced-motion: reduce)').matches || !element) return false;
    const bounds = element.getBoundingClientRect();
    return bounds.bottom > 0 && bounds.top < window.innerHeight;
  }
  function canAnimatePicture(source: HTMLElement | null): source is HTMLElement {
    const image = source?.querySelector('img');
    return canAnimateElement(source) && loadedThumbnails.has(source) && !!image?.complete && !!image.naturalWidth
      && getComputedStyle(image).visibility === 'visible' && !image.getAnimations().some(animation => animation.playState === 'running');
  }
  function restoreListPosition(position: EventListPosition): HTMLElement | null {
    const item = position.eventId ? document.getElementById(position.eventId) : null;
    const bounds = item?.getBoundingClientRect();
    const top = bounds && position.offset !== undefined ? window.scrollY + bounds.top - position.offset : position.y;
    if (window.scrollY !== top || window.scrollX !== 0) window.scrollTo({ left: 0, top, behavior: 'instant' });
    return item;
  }
  function animateEvent(source: HTMLElement | null, eventId: string, update: () => void | Promise<unknown>, returning = false, kind: 'event' | 'label' = 'event') {
    const pictureReady = source ? new Promise<boolean>(resolve => { eventPhotoTransition.ready = () => resolve(true); }) : Promise.resolve(true);
    const routeReady = new Promise<void>(resolve => { transitionRouteReady = resolve; });
    flushSync(() => {
      eventPhotoTransition.file = source ? loadedThumbnails.get(source) ?? null : null;
      eventPhotoTransition.name = source?.dataset.pictureName ?? null;
      eventPhotoTransition.returning = returning;
      eventPhotoTransition.eventId = eventId;
      eventPhotoTransition.kind = kind;
    });
    if (source) source.style.viewTransitionName = 'event-photo';
    document.documentElement.classList.add('ui-photo-transition');
    const transition = document.startViewTransition(async () => {
      if (source) source.style.viewTransitionName = 'none';
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await update();
        const loaded = await Promise.race([
          Promise.all([pictureReady, routeReady]).then(() => true),
          new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 80); }),
        ]);
        if (!loaded) transition.skipTransition();
        if (returning && loaded) {
          const position = history.state?.[kind === 'label' ? 'limethatLabelList' : 'limethatEventList'] as EventListPosition | undefined;
          if (position?.url === (window.location.hash || '#/')) restoreListPosition(position);
          const item = document.getElementById(`${kind}-${eventId}`);
          const destinationTitle = item?.querySelector<HTMLElement>(kind === 'label' ? '.ui-label-row__title' : '.ui-event-card__title');
          const bounds = (source ? item?.querySelector('.ui-archive-picture') : destinationTitle)?.getBoundingClientRect();
          if (!item || item.closest('[inert]') || !bounds || bounds.bottom <= 0 || bounds.top >= window.innerHeight) {
            transition.skipTransition();
          }
        }
        await tick();
      } finally { clearTimeout(timer); }
    });
    activeEventTransition = transition;
    const cleanup = () => {
      if (source) source.style.viewTransitionName = 'none';
      eventPhotoTransition.eventId = null;
      eventPhotoTransition.ready = null;
      eventPhotoTransition.file = null;
      eventPhotoTransition.name = null;
      eventPhotoTransition.returning = false;
      transitionRouteReady = null;
      document.documentElement.classList.remove('ui-photo-transition');
      activeEventTransition = null;
    };
    void transition.ready.catch(error => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) console.warn('Event transition failed.', error);
    });
    void transition.finished.then(cleanup, cleanup);
  }
  function returnToList(href: string, update: () => void | Promise<unknown>): boolean {
    const kind = router.location.startsWith('/labels/') ? 'label' : 'event';
    const position = pendingListPosition ?? history.state?.[kind === 'label' ? 'limethatLabelList' : 'limethatEventList']
      ?? (kind === 'label' ? labelListNavigation.position : eventListNavigation.position);
    const id = kind === 'label' ? currentLabel && labelKey(currentLabel.id) : currentEvent?.id;
    const picture = document.querySelector<HTMLElement>('main .ui-detail-media .ui-archive-picture');
    const source = canAnimatePicture(picture) ? picture : null;
    const title = document.querySelector<HTMLElement>('main h1.ui-detail-title');
    const listHref = kind === 'label' ? /^#\/labels(?:\?|$)/ : /^#\/(?:events)?(?:\?|$)/;
    if (!listHref.test(href) || !id || editorRoute || !position || position.url !== href
      || !document.getElementById(`${kind}-${id}`) || (!source && !canAnimateElement(title))) return false;
    pendingListPosition = position;
    animateEvent(source, id, update, true, kind);
    return true;
  }
  function openEvent(href: string, anchor: HTMLAnchorElement | null, update: () => void | Promise<unknown>): boolean {
    if (!anchor || anchor.closest('[inert]')) return false;
    const labelDirectory = router.location === '/labels' && !!anchor.closest('.ui-label-list');
    if (!labelDirectory && !anchor.closest('.ui-timeline')) return false;
    const kind = labelDirectory ? 'label' : 'event';
    const picture = anchor.querySelector<HTMLElement>('.ui-archive-picture');
    const source = canAnimatePicture(picture) ? picture : null;
    const title = anchor.querySelector<HTMLElement>(kind === 'label' ? '.ui-label-row__title' : '.ui-event-card__title');
    const id = kind === 'label'
      ? session.workspace.summary?.labels.find(item => labelHref(labelKey(item.id)) === href)?.id
      : session.workspace.summary?.events.find(item => `#/events/${encodeURIComponent(item.id)}` === href)?.id;
    if (id === undefined || (!source && !canAnimateElement(title))) return false;
    animateEvent(source, kind === 'label' ? labelKey(id) : String(id), update, false, kind);
    return true;
  }
  function followLink(href: string, anchor: HTMLAnchorElement) {
    if (activeEventTransition) { activeEventTransition.skipTransition(); void push(href); return; }
    if ((anchor.hasAttribute('data-restore-event-list') || anchor.hasAttribute('data-restore-label-list')) && returnToList(href, () => push(href))) return;
    if (!openEvent(href, anchor, () => push(href))) void push(href);
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
      let href = anchor?.getAttribute('href');
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !href?.startsWith('#/') || !anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      event.preventDefault();
      const dockNavigation = !!anchor.closest('.ui-dock .ui-navigation');
      if (dockNavigation && ((href === '#/events' && eventListRoute) || (href === '#/labels' && router.location === '/labels') || (href === '#/settings' && router.location === '/settings'))) return;
      if (eventListRoute || router.location === '/labels') {
        const labels = router.location === '/labels';
        const selector = labels ? '.ui-label-list > li' : '.ui-timeline > li';
        const items = document.querySelectorAll<HTMLElement>(selector);
        const visible = anchor.closest<HTMLElement>(selector)
          ?? Array.from(items).find(item => item.getBoundingClientRect().bottom > 160);
        const navigation = labels ? labelListNavigation : eventListNavigation;
        navigation.position = {
          url: window.location.hash || '#/', y: window.scrollY,
          eventId: visible?.id, offset: visible?.getBoundingClientRect().top, focusHref: href,
        };
        history.replaceState({ ...history.state, [labels ? 'limethatLabelList' : 'limethatEventList']: { ...navigation.position } }, '');
      }
      if (router.location === '/settings') {
        settingsPosition = { url: window.location.hash || '#/settings', y: window.scrollY };
        history.replaceState({ ...history.state, limethatSettings: { ...settingsPosition } }, '');
      }
      if (dockNavigation) {
        const position = href === '#/events' ? eventListNavigation.position : href === '#/labels' ? labelListNavigation.position : href === '#/settings' ? settingsPosition : null;
        if (position) { href = position.url; pendingListPosition = position; }
      }
      if (anchor.hasAttribute('data-restore-event-list')) pendingListPosition = eventListNavigation.position;
      if (anchor.hasAttribute('data-restore-label-list')) pendingListPosition = labelListNavigation.position;
      history.replaceState({ ...history.state, limethatFocus: href }, '');
      followLink(href, anchor);
    };
    // Start history snapshots at popstate, before traversal scroll restoration and the router's hashchange update.
    let replayingHashChange = false;
    let heldHash: string | null = null;
    const historyNavigation = () => {
      if (activeEventTransition) return;
      const href = window.location.hash || '#/';
      const update = () => {
        if ((window.location.hash || '#/') !== href) { heldHash = null; activeEventTransition?.skipTransition(); return; }
        replayingHashChange = true;
        try { window.dispatchEvent(new Event('hashchange')); }
        finally { replayingHashChange = false; }
      };
      const anchor = Array.from(document.querySelectorAll<HTMLAnchorElement>(`main a[href="${CSS.escape(href)}"]`))
        .find(item => !item.closest('[inert]') && !!item.closest('.ui-timeline, .ui-label-list')) ?? null;
      if (returnToList(href, update) || openEvent(href, anchor, update)) heldHash = href;
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
    return () => { stopInstallation(); window.removeEventListener('online', online); window.removeEventListener('offline', online); window.removeEventListener('popstate', historyNavigation, true); window.removeEventListener('hashchange', holdRouterUpdate, true); window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate); activeEventTransition?.skipTransition(); };
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
      labelListNavigation.position = null;
      settingsPosition = null;
      pendingListPosition = null;
      history.replaceState({ ...history.state, limethatEventList: undefined, limethatLabelList: undefined, limethatSettings: undefined }, '');
      session.reviewRequired = false;
      session.notice = `Opened ${archive.root.name}.`;
    }
  });
  let pendingListPosition: EventListPosition | null = null;
  let settingsPosition: EventListPosition | null = null;
  let routeLoadedOnce = false;
  async function routeLoaded() {
    if (!routeLoadedOnce) { routeLoadedOnce = true; return; }
    await tick();
    const location = window.location.hash || '#/';
    const stateKey = router.location === '/labels' ? 'limethatLabelList' : router.location === '/settings' ? 'limethatSettings' : 'limethatEventList';
    const position = pendingListPosition ?? history.state?.[stateKey] as EventListPosition | undefined;
    pendingListPosition = null;
    if (position && position.url === location && (eventListRoute || router.location === '/labels' || router.location === '/settings')) {
      // View transitions pause painting, so waiting for an animation frame here can stall the return snapshot.
      if (!transitionRouteReady) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if ((window.location.hash || '#/') !== location) return;
      const item = restoreListPosition(position);
      history.replaceState({ ...history.state, [stateKey]: { ...position } }, '');
      const href = position.focusHref;
      const link = href ? document.querySelector<HTMLElement>(`main a[href="${CSS.escape(href)}"]`) : null;
      (link ?? item?.querySelector<HTMLElement>('a') ?? document.querySelector<HTMLElement>('main'))?.focus({ preventScroll: true });
      transitionRouteReady?.();
      return;
    }
    const saved = history.state?.limethatFocus as string | undefined;
    const target = saved ? Array.from(document.querySelectorAll<HTMLElement>(`main a[href="${CSS.escape(saved)}"]`))
      .find(link => !link.closest('[inert]')) : null;
    (target ?? document.querySelector<HTMLElement>('main h1.ui-detail-title[tabindex]') ?? document.querySelector<HTMLElement>('main'))?.focus({ preventScroll: true });
    transitionRouteReady?.();
  }
</script>

{#if import.meta.env.MODE === 'framing'}
  <main><h1>Limethat image framing harness</h1>{#await import('./dev/ImageFrameHarness.svelte') then { default: Harness }}<Harness />{/await}</main>
{:else if !session.workspace.summary && !session.workspace.translationRecovery}
  <Welcome />
{:else}
  <AppShell>
    {#snippet footer()}
      {#if !editorRoute}<AppDock {section} showScrollTop label={section === 'settings' ? 'Refresh archive' : `${(section === 'labels' ? currentLabel : currentEvent) ? 'Edit' : 'Create'} ${section === 'labels' ? 'label' : 'event'}`} icon={section === 'settings' ? 'reset' : (section === 'labels' ? currentLabel : currentEvent) ? 'edit' : 'create'} disabled={section === 'settings' ? !!session.workspace.operation || !session.workspace.capability.supported : !session.canWrite} onclick={dockAction} />{/if}
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
            <LabelList active={router.location === '/labels'} />
          {/key}
          <Router {routes} restoreScrollState onRouteLoaded={routeLoaded} />
        </div>
      {/if}
    </div>
  </AppShell>
  <PictureViewer />
{/if}
