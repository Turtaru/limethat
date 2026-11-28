<script lang="ts">
  import { flushSync, onMount, setContext, tick } from 'svelte';
  import Router, { router, push, replace } from 'svelte-spa-router';
  import { AppShell } from './lib/ui-kit';
  import { Session, sessionKey } from './features/session.svelte';
  import Events from './features/Events.svelte';
  import EventList from './features/EventList.svelte';
  import LabelList from './features/LabelList.svelte';
  import { labelHref } from './features/models';
  import { captureListPosition, listSelector, restoreListPosition } from './features/list-position';
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
          const position = session.navigation.position(window.location.hash || '#/');
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
    const position = session.navigation.position(href);
    const id = kind === 'label' ? currentLabel && labelKey(currentLabel.id) : currentEvent?.id;
    const picture = document.querySelector<HTMLElement>('main .ui-detail-media .ui-archive-picture');
    const source = canAnimatePicture(picture) ? picture : null;
    const title = document.querySelector<HTMLElement>('main h1.ui-detail-title');
    const listHref = kind === 'label' ? /^#\/labels(?:\?|$)/ : /^#\/(?:events)?(?:\?|$)/;
    if (!listHref.test(href) || !id || editorRoute || !position || position.url !== href
      || !document.getElementById(`${kind}-${id}`) || (!source && !canAnimateElement(title))) return false;
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
    // Replace the viewer layer when navigating away so its dismissal cannot race a separate history.back().
    if (history.state?.limethatPictureViewer) {
      history.replaceState({ ...history.state, limethatPictureViewer: undefined }, '');
      session.viewer = null;
      void replace(href);
      return;
    }
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
    let scrollFrame = 0;
    const saveScroll = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        if (activeEventTransition || session.viewer || renderedUrl?.split('?')[0] !== (window.location.hash || '#/').split('?')[0]) return;
        const selector = listSelector(router.location);
        session.navigation.remember(selector ? captureListPosition(selector) : { url: window.location.hash || '#/', y: window.scrollY });
      });
    };
    window.addEventListener('scroll', saveScroll, { passive: true });
    const navigate = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      let href = anchor?.getAttribute('href');
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !href?.startsWith('#/') || !anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      event.preventDefault();
      const dockNavigation = !!anchor.closest('.ui-dock .ui-navigation');
      if (dockNavigation && ((href === '#/events' && eventListRoute) || (href === '#/labels' && router.location === '/labels') || (href === '#/settings' && router.location === '/settings'))) return;
      const from = window.location.hash || '#/';
      const selector = listSelector(router.location);
      session.navigation.remember(selector ? captureListPosition(selector, href, anchor) : { url: from, y: window.scrollY }, href);
      if (dockNavigation) href = session.navigation.destination(href);
      session.navigation.prepare(from, href);
      renderedUrl = null;
      followLink(href, anchor);
    };
    // Start history snapshots at popstate, before traversal scroll restoration and the router's hashchange update.
    let replayingHashChange = false;
    let heldHash: string | null = null;
    const historyNavigation = () => {
      renderedUrl = null;
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
    return () => { window.removeEventListener('scroll', saveScroll); cancelAnimationFrame(scrollFrame); stopInstallation(); window.removeEventListener('online', online); window.removeEventListener('offline', online); window.removeEventListener('popstate', historyNavigation, true); window.removeEventListener('hashchange', holdRouterUpdate, true); window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate); activeEventTransition?.skipTransition(); };
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
      session.navigation.reset();
      session.reviewRequired = false;
      session.notice = `Opened ${archive.root.name}.`;
    }
  });
  let routeLoadedOnce = false;
  let renderedUrl: string | null = null;
  async function routeLoaded() {
    await tick();
    // Router restoration is disabled; take browser restoration ownership after the router's mount effect.
    history.scrollRestoration = 'manual';
    const location = window.location.hash || '#/';
    const entry = session.navigation.arrive(location);
    if (!routeLoadedOnce) { routeLoadedOnce = true; renderedUrl = location; return; }
    const position = entry.position;
    if (position && position.url === location) {
      // View transitions pause painting, so waiting for an animation frame here can stall the return snapshot.
      if (!transitionRouteReady) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if ((window.location.hash || '#/') !== location) return;
      const item = restoreListPosition(position);
      renderedUrl = location;
      const href = position.focusHref;
      const link = href ? Array.from(document.querySelectorAll<HTMLElement>(`main a[href="${CSS.escape(href)}"]`))
        .find(item => !item.closest('[inert]')) : null;
      (link ?? item?.querySelector<HTMLElement>('a') ?? document.querySelector<HTMLElement>('main'))?.focus({ preventScroll: true });
      transitionRouteReady?.();
      return;
    }
    window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
    renderedUrl = location;
    const saved = entry.focusHref;
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
      {#if !session.workspace.translationRecovery && router.location !== '/settings' && (session.workspace.state !== 'ready' || session.reviewRequired || session.workspace.persistenceWarning || session.workspace.snapshotWarning)}<Connection />{/if}
      {#if session.workspace.snapshotStatus}
        <p class="ui-status" role="status">{session.workspace.snapshotStatus === 'cached' ? 'Showing cached events; checking the archive folder.' : 'Building this device’s event index; the list is incomplete.'} {session.workspace.loadProgress ? `${session.workspace.loadProgress.read}/${session.workspace.loadProgress.total} event files checked.` : ''} Editing stays disabled until verification finishes.</p>
      {/if}
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
          <Router {routes} onRouteLoaded={routeLoaded} />
        </div>
      {/if}
    </div>
  </AppShell>
  <PictureViewer />
{/if}
