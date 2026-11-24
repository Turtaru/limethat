<script lang="ts">
  import { ActivityGrid, EventCard } from '../lib/ui-kit';
  import { photoNames } from '../lib/archive-format';
  import type { ArchiveEvent } from '../lib/archive-format';
  import ArchivePicture from './ArchivePicture.svelte';
  import { eventHref, eventDates, dateLabel, description, timelineGroups } from './models';
  import { activityCounts, activityDays, activityTarget } from './activity';
  let { events, showActivity = false }: { events: ArchiveEvent[]; showActivity?: boolean } = $props();
  const counts = $derived(activityCounts(showActivity ? events : []));
  const groups = $derived(timelineGroups(events));
  function jumpToDay(date: string) {
    const id = activityTarget(events, date);
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start' });
  }
</script>
<div class="ui-stack">
  {#each groups as group, index (group.events[0].id)}
    {@const year = group.events[0].startDate?.slice(0, 4)}
    <section class="ui-stack">
      {#if showActivity && year && (index === 0 || year !== groups[index - 1].events[0].startDate?.slice(0, 4))}
        <section class="ui-year-activity" aria-label={`${year} activity`}>
          <h2 class="ui-year-activity__title">{year}</h2>
          <ActivityGrid title={year} days={activityDays(year, counts)} showCaption={false} onselect={jumpToDay} />
        </section>
      {/if}
      <h2 class="ui-month" id={`month-${group.month}`} tabindex="-1">{group.events[0].startDate ? dateLabel(group.month) : 'Undated'}</h2>
      {#if showActivity && group.month.length === 7}<ActivityGrid title={dateLabel(group.month)} days={activityDays(group.month, counts)} showCaption={false} />{/if}
      <ol class="ui-timeline">
        {#each group.events as event (event.id)}
          {@const photo = photoNames(event.body)[0]}
          <li id={`event-${event.id}`} tabindex="-1">
            {#snippet image()}<ArchivePicture name={photo} alt={event.title} frame={event.frames[photo]} />{/snippet}
            <EventCard href={eventHref(event.id)} title={event.title} date={event.startDate ?? undefined} dateLabel={eventDates(event)} description={description(event.body)} labels={event.tags.map(tag => tag.title)} picture={photo ? image : undefined} />
          </li>
        {/each}
      </ol>
    </section>
  {:else}<p class="ui-empty">No matching events.</p>{/each}
</div>
