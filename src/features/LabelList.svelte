<script lang="ts">
  import { router } from 'svelte-spa-router';
  import { Field, LabelRow, ResultCount } from '../lib/ui-kit';
  import { labelKey } from '../lib/archive-format';
  import { useSession } from './session.svelte';
  import { labelCount, labelHref, pictureName } from './models';
  import ArchivePicture from './ArchivePicture.svelte';
  import { eventPhotoTransition } from './event-photo-transition.svelte';

  let { active }: { active: boolean } = $props();
  const session = useSession();
  const summary = $derived(session.workspace.summary);
  let visited = $state(false);
  let query = $state('');
  const matches = $derived((summary?.labels ?? []).filter(item => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => a.title.localeCompare(b.title)));
  $effect(() => {
    if (!active) return;
    visited = true;
    query = new URLSearchParams(router.querystring).get('q') ?? '';
  });
  function search(event: Event) {
    query = (event.currentTarget as HTMLInputElement).value;
    history.replaceState({ ...history.state, limethatLabelList: undefined }, '', `#/labels${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  }
</script>

{#if visited}
  <div class="ui-cached-view" class:ui-cached-view--inactive={!active} inert={!active} aria-hidden={!active}>
    <div class="ui-stack ui-label-directory">
      <h1 class="ui-sr-only">Labels</h1>
      <div class="ui-timeline-toolbar ui-timeline-toolbar--with-count">
        <div class="ui-search ui-search--compact"><Field label="Search labels">{#snippet children(control)}<input class="ui-input" id={control.id} type="search" bind:value={query} placeholder="Search labels" oninput={search}>{/snippet}</Field></div>
        <ResultCount count={matches.length} singular="label" />
      </div>
      <ul class="ui-label-list">
        {#each matches as item (labelKey(item.id))}
          {@const name = pictureName(item.picture)}
          {@const selected = active && eventPhotoTransition.kind === 'label' && eventPhotoTransition.eventId === labelKey(item.id)}
          {@const transitioning = selected && !!eventPhotoTransition.file && eventPhotoTransition.returning}
          <li id={`label-${labelKey(item.id)}`}>
            {#snippet image()}{#if name}<ArchivePicture {name} alt={item.title} frame={item.picture_frame} {active} transitionName={transitioning ? 'event-photo' : undefined} onready={transitioning ? eventPhotoTransition.ready ?? undefined : undefined} />{/if}{/snippet}
            <LabelRow name={item.title} count={summary ? labelCount(summary, labelKey(item.id)) : 0} href={labelHref(labelKey(item.id))} picture={name ? image : undefined} titleTransitionName={selected ? 'event-title' : undefined} />
          </li>
        {:else}<li><p class="ui-empty">No matching labels.</p></li>{/each}
      </ul>
    </div>
  </div>
{/if}
