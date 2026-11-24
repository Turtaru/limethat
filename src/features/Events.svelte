<script lang="ts">
  import { router, replace } from 'svelte-spa-router';
  import { tick } from 'svelte';
  import { Button, Dialog, Field, LabelLink, PageHeading, ResultCount } from '../lib/ui-kit';
  import { photoNames } from '../lib/archive-format';
  import { useSession } from './session.svelte';
  import Connection from './Connection.svelte';
  import AppDock from './AppDock.svelte';
  import { description, eventDates, dateLabel, labelHref, matchesEvent } from './models';
  import ArchivePicture from './ArchivePicture.svelte';
  import Markdown from '../lib/ui-kit/ui/Markdown.svelte';
  import Timeline from './Timeline.svelte';
  import { eventListNavigation } from './event-list-navigation.svelte';
  let { params = {} }: { params?: Record<string, string> } = $props();
  const session = useSession();
  const summary = $derived(session.workspace.summary);
  const event = $derived(summary?.events.find(item => item.id.toLowerCase() === params.id?.toLowerCase()));
  let query = $state(new URLSearchParams(router.querystring).get('q') ?? '');
  let appliedQuery = $state(new URLSearchParams(router.querystring).get('q') ?? '');
  let dateOpen = $state(false);
  let month = $state('');
  let deleting = $state(false);
  let confirmDelete = $state(false);
  let error = $state('');
  const matches = $derived((summary?.events ?? []).filter(item => matchesEvent(item, appliedQuery)));
  const months = $derived([...new Set(matches.flatMap(item => item.startDate && item.startDate.length >= 7 ? [item.startDate.slice(0, 7)] : []))]);
  $effect(() => { appliedQuery = query = new URLSearchParams(router.querystring).get('q') ?? ''; });
  $effect(() => {
    const value = query;
    const timer = setTimeout(() => { appliedQuery = value; }, 150);
    return () => clearTimeout(timer);
  });
  function search(event: Event) {
    query = (event.currentTarget as HTMLInputElement).value;
    history.replaceState({ ...history.state, limethatEventList: undefined }, '', `#/events${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  }
  async function jump() {
    dateOpen = false;
    await tick();
    const target = document.getElementById(`month-${month}`);
    if (target) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'start' }); }
  }
  async function remove() {
    if (!event || !session.canWrite || deleting) return;
    deleting = true; error = '';
    try {
      session.result(await session.workspace.deleteEvent(event));
      confirmDelete = false;
      void replace('/events');
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Delete failed.'; }
    finally { deleting = false; }
  }
</script>

{#if params.id}
  <div class="ui-stack">
    <div class="ui-detail-toolbar"><a class="ui-button ui-button--quiet" href={eventListNavigation.position?.url ?? '#/events'} data-restore-event-list>← All events</a>{#if event}<Button variant="quiet" class="ui-delete-action" disabled={!session.canWrite} onclick={() => { confirmDelete = true; error = ''; }}>Delete</Button>{/if}</div>
    {#if event}
      <div class="ui-detail-layout">
        <div class="ui-stack ui-detail-media">
          {#each photoNames(event.body) as name (name)}<ArchivePicture {name} alt={event.title} frame={event.frames[name]} viewable thumbnail={false} />{/each}
          <section class="ui-detail-field" aria-label="Labels">
            <h2 class="ui-section-label">Labels</h2>
            <div class="ui-cluster">{#each event.tags as tag}<LabelLink name={tag.title} href={labelHref(tag.id)} />{/each}</div>
          </section>
        </div>
        <div class="ui-stack ui-detail-content">
          <div class="ui-detail-field"><p class="ui-section-label">Date</p><p class="ui-description">{eventDates(event)}</p></div>
          <header class="ui-detail-field"><p class="ui-section-label">Title</p><h1 class="ui-detail-title">{event.title}</h1></header>
          <section class="ui-detail-field" aria-label="Description"><h2 class="ui-section-label">Description</h2><Markdown source={description(event.body) || 'No description added.'} /></section>
        </div>
      </div>
    {:else if summary}<PageHeading title="Event not found" /><p class="ui-empty">This event is not in the connected archive.</p>{/if}
  </div>
{:else}
  <div class="ui-stack">
    <h1 class="ui-sr-only">Events</h1>
    <div class="ui-timeline-toolbar ui-timeline-toolbar--with-count">
      <div class="ui-search ui-search--compact"><Field label="Search events">{#snippet children(control)}<input id={control.id} class="ui-input" type="search" placeholder="Search events" bind:value={query} oninput={search}>{/snippet}</Field><Button class="ui-calendar-button" aria-label="Jump to date" title="Jump to date" disabled={!months.length} onclick={() => { month = months[0]; dateOpen = true; }}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4m8-4v4M4 11h16" /></svg></Button></div>
      <ResultCount count={matches.length} singular="event" />
    </div>
    <Timeline events={matches} showActivity />
  </div>
{/if}

<Dialog bind:open={dateOpen} title="Jump to date" variant="sheet">
  <form id="date-jump-form" class="ui-stack" onsubmit={(event) => { event.preventDefault(); void jump(); }}>
    <Field label="Month">{#snippet children(control)}<select class="ui-input" id={control.id} bind:value={month}>{#each months as item}<option value={item}>{dateLabel(item)}</option>{/each}</select>{/snippet}</Field>
  </form>
  {#snippet dock()}<AppDock section="events" label="Jump to date" icon="save" type="submit" form="date-jump-form" />{/snippet}
</Dialog>
<Dialog bind:open={confirmDelete} title="Delete event?" dismissible={!deleting}>
  <p>The event will be removed. Its pictures and verified recovery backup will remain in the archive.</p>
  {#if error}<p class="ui-error" role="alert">{error}</p>{/if}
  {#if !session.canWrite && !deleting}<Connection compact />{/if}
  {#snippet footer()}<div class="ui-actions"><Button disabled={deleting} onclick={() => { confirmDelete = false; }}>Cancel</Button><Button variant="danger" disabled={deleting || !session.canWrite} onclick={remove}>{deleting ? 'Deleting…' : 'Delete event'}</Button></div>{/snippet}
</Dialog>
