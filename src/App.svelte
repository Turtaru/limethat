<script lang="ts">
  import { onMount, setContext, tick } from 'svelte';
  import Router, { router, push } from 'svelte-spa-router';
  import { AppShell } from './lib/ui-kit';
  import { Session, sessionKey } from './features/session.svelte';
  import Events from './features/Events.svelte';
  import EventList from './features/EventList.svelte';
  import { eventListNavigation, type EventListPosition } from './features/event-list-navigation.svelte';
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
      void push(href);
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', navigate);
    return () => { stopInstallation(); window.removeEventListener('online', online); window.removeEventListener('offline', online); window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate); };
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
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if ((window.location.hash || '#/') !== location) return;
      const item = position.eventId ? document.getElementById(position.eventId) : null;
      window.scrollTo(0, item && position.offset !== undefined
        ? window.scrollY + item.getBoundingClientRect().top - position.offset : position.y);
      history.replaceState({ ...history.state, limethatEventList: { ...position } }, '');
      const href = position.focusHref;
      const link = href ? document.querySelector<HTMLElement>(`main a[href="${CSS.escape(href)}"]`) : null;
      (link ?? item?.querySelector<HTMLElement>('a'))?.focus({ preventScroll: true });
      return;
    }
    const saved = history.state?.limethatFocus as string | undefined;
    const target = saved ? Array.from(document.querySelectorAll<HTMLElement>(`main a[href="${CSS.escape(saved)}"]`))
      .find(link => !link.closest('[inert]')) : null;
    (target ?? document.querySelector<HTMLElement>('main'))?.focus({ preventScroll: true });
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
