<script lang="ts">
  import { ActivityGrid, EventCard } from '../lib/ui-kit';
  import { photoNames } from '../lib/archive-format';
  import type { ArchiveEvent } from '../lib/archive-format';
  import ArchivePicture from './ArchivePicture.svelte';
  import { eventHref, eventDates, dateLabel, description, monthKey } from './models';
  import { activityCounts, activityDays } from './activity';
  let { events, showActivity = false }: { events: ArchiveEvent[]; showActivity?: boolean } = $props();
  const counts = $derived(activityCounts(showActivity ? events : []));
</script>
<ol class="ui-timeline">
  {#each events as event, index (event.id)}
    {@const photo = photoNames(event.body)[0]}
    {@const year = event.startDate?.slice(0, 4)}
    {@const month = monthKey(event)}
    <li id={`event-${event.id}`} tabindex="-1">
      {#if showActivity && year && (index === 0 || year !== events[index - 1].startDate?.slice(0, 4))}
        <section class="ui-year-activity" aria-label={`${year} activity`}>
          <h2 class="ui-year-activity__title">{year}</h2>
          <ActivityGrid title={year} days={activityDays(year, counts)} showCaption={false} />
        </section>
      {/if}
      {#if index === 0 || month !== monthKey(events[index - 1])}
        <h2 class="ui-month" id={`month-${month}`} tabindex="-1">{event.startDate ? dateLabel(month) : 'Undated'}</h2>
        {#if showActivity && month.length === 7}<ActivityGrid title={dateLabel(month)} days={activityDays(month, counts)} showCaption={false} />{/if}
      {/if}
      {#snippet image()}<ArchivePicture name={photo} alt={event.title} frame={event.frames[photo]} />{/snippet}
      <EventCard href={eventHref(event.id)} title={event.title} date={event.startDate ?? undefined} dateLabel={eventDates(event)} description={description(event.body)} labels={event.tags.map(tag => tag.title)} picture={photo ? image : undefined} />
    </li>
  {:else}<li><p class="ui-empty">No matching events.</p></li>{/each}
</ol>
