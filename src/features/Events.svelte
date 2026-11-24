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
  import Timeline from './Timeline.svelte';
  let { params = {} }: { params?: Record<string, string> } = $props();
  const session = useSession();
  const summary = $derived(session.workspace.summary);
  const event = $derived(summary?.events.find(item => item.id.toLowerCase() === params.id?.toLowerCase()));
  let query = $state(new URLSearchParams(router.querystring).get('q') ?? '');
  let dateOpen = $state(false);
  let month = $state('');
  let deleting = $state(false);
  let confirmDelete = $state(false);
  let error = $state('');
  const matches = $derived((summary?.events ?? []).filter(item => matchesEvent(item, query)));
  const months = $derived([...new Set(matches.flatMap(item => item.startDate && item.startDate.length >= 7 ? [item.startDate.slice(0, 7)] : []))]);
  $effect(() => { query = new URLSearchParams(router.querystring).get('q') ?? ''; });
  function search() { history.replaceState(history.state, '', `#/events${query ? `?q=${encodeURIComponent(query)}` : ''}`); }
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
    <div class="ui-detail-toolbar"><a class="ui-button ui-button--quiet" href="#/events">← All events</a>{#if event}<Button variant="quiet" class="ui-delete-action" disabled={!session.canWrite} onclick={() => { confirmDelete = true; error = ''; }}>Delete</Button>{/if}</div>
    {#if event}
      <PageHeading title={event.title} eyebrow={eventDates(event)} />
      {#each photoNames(event.body) as name (name)}<ArchivePicture {name} alt={event.title} frame={event.frames[name]} viewable thumbnail={false} />{/each}
      <p class="ui-description">{description(event.body) || 'No description added.'}</p>
      <p class="ui-section-label">Labels</p>
      <div class="ui-cluster">{#each event.tags as tag}<LabelLink name={tag.title} href={labelHref(tag.id)} />{/each}</div>
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
