<script lang="ts">
  type Day = { date: string; count: number };
  let { title, days, showCaption = true }: { title: string; days: Day[]; showCaption?: boolean } = $props();
  const total = $derived(days.reduce((sum, day) => sum + day.count, 0));
  const active = $derived(days.filter(day => day.count > 0));
</script>

<figure class="ui-activity">
  <figcaption class="ui-activity__caption" class:ui-sr-only={!showCaption}>{title} · {total} {total === 1 ? 'event' : 'events'}</figcaption>
  <div class="ui-activity__grid" role="img" aria-label={`${title}: ${total} events across ${active.length} active days.`}>
    {#each days as day}
      <span class="ui-activity__day" data-level={Math.max(0, Math.min(4, day.count))} title={`${day.date}: ${day.count} events`} aria-hidden="true"></span>
    {/each}
  </div>
</figure>
