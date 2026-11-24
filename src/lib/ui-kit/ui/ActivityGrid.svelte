<script lang="ts">
  type Day = { date: string; count: number };
  let { title, days, showCaption = true, onselect }: { title: string; days: Day[]; showCaption?: boolean; onselect?: (date: string) => void } = $props();
  const total = $derived(days.reduce((sum, day) => sum + day.count, 0));
  const active = $derived(days.filter(day => day.count > 0));
</script>

<figure class="ui-activity">
  <figcaption class="ui-activity__caption" class:ui-sr-only={!showCaption}>{title} · {total} {total === 1 ? 'event' : 'events'}</figcaption>
  <div class="ui-activity__grid" role={onselect ? 'group' : 'img'} aria-label={`${title}: ${total} events across ${active.length} active days.`}>
    {#each days as day}
      {#if onselect && day.count > 0}
        <button type="button" class="ui-activity__target" aria-label={`Jump to ${day.date}: ${day.count} ${day.count === 1 ? 'event' : 'events'}`} title={`${day.date}: ${day.count} events`} onclick={() => onselect?.(day.date)}>
          <span class="ui-activity__day" data-level={Math.max(0, Math.min(4, day.count))} aria-hidden="true"></span>
        </button>
      {:else}
        <span class="ui-activity__empty ui-activity__day" aria-hidden="true" data-level={Math.max(0, Math.min(4, day.count))} title={`${day.date}: ${day.count} events`}></span>
      {/if}
    {/each}
  </div>
</figure>
