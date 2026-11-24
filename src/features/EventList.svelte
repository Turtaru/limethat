<script lang="ts">
  import { tick } from 'svelte';
  import { router } from 'svelte-spa-router';
  import { Button, Dialog, Field, ResultCount } from '../lib/ui-kit';
  import { useSession } from './session.svelte';
  import { dateLabel, matchesEvent } from './models';
  import AppDock from './AppDock.svelte';
  import Timeline from './Timeline.svelte';

  let { active }: { active: boolean } = $props();
  const session = useSession();
  let visited = $state(false);
  let query = $state('');
  let appliedQuery = $state('');
  let dateOpen = $state(false);
  let month = $state('');
  const matches = $derived((session.workspace.summary?.events ?? []).filter(item => matchesEvent(item, appliedQuery)));
  const months = $derived([...new Set(matches.flatMap(item => item.startDate && item.startDate.length >= 7 ? [item.startDate.slice(0, 7)] : []))]);

  $effect(() => {
    if (!active) { dateOpen = false; return; }
    visited = true;
    appliedQuery = query = new URLSearchParams(router.querystring).get('q') ?? '';
  });
  $effect(() => {
    if (!active) return;
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
</script>

{#if visited}
  <div class="ui-cached-view" class:ui-cached-view--inactive={!active} inert={!active} aria-hidden={!active}>
    <div class="ui-stack">
      <h1 class="ui-sr-only">Events</h1>
      <div class="ui-timeline-toolbar ui-timeline-toolbar--with-count">
        <div class="ui-search ui-search--compact"><Field label="Search events">{#snippet children(control)}<input id={control.id} class="ui-input" type="search" placeholder="Search events" bind:value={query} oninput={search}>{/snippet}</Field><Button class="ui-calendar-button" aria-label="Jump to date" title="Jump to date" disabled={!months.length} onclick={() => { month = months[0]; dateOpen = true; }}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4m8-4v4M4 11h16" /></svg></Button></div>
        <ResultCount count={matches.length} singular="event" />
      </div>
      <Timeline events={matches} showActivity picturesActive={active} />
    </div>
  </div>
{/if}

{#if active}
  <Dialog bind:open={dateOpen} title="Jump to date" variant="sheet">
    <form id="date-jump-form" class="ui-stack" onsubmit={(event) => { event.preventDefault(); void jump(); }}>
      <Field label="Month">{#snippet children(control)}<select class="ui-input" id={control.id} bind:value={month}>{#each months as item}<option value={item}>{dateLabel(item)}</option>{/each}</select>{/snippet}</Field>
    </form>
    {#snippet dock()}<AppDock section="events" label="Jump to date" icon="save" type="submit" form="date-jump-form" />{/snippet}
  </Dialog>
{/if}
