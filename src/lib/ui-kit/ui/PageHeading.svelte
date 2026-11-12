<script lang="ts">
  let { title, eyebrow, subtitle, level = 1 }: { title: string; eyebrow?: string; subtitle?: string; level?: 1 | 2 } = $props();
</script>

<div class="ui-heading">
  {#if eyebrow}<p class="ui-heading__eyebrow">{eyebrow}</p>{/if}
  <svelte:element this={level === 1 ? 'h1' : 'h2'} class:ui-heading__title--section={level === 2} class="ui-heading__title">{title}</svelte:element>
  {#if subtitle}<p class="ui-heading__subtitle">{subtitle}</p>{/if}
</div>
