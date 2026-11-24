<script lang="ts">
  let scrollY = $state(0);
  let focused = $state(false);
  function scrollToTop() {
    document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
</script>

<svelte:window bind:scrollY />

{#if scrollY > 300 || focused}
  <button class="ui-dock__action ui-dock__top" type="button" aria-label="Scroll to top" title="Scroll to top" onclick={scrollToTop} onfocus={() => { focused = true; }} onblur={() => { focused = false; }}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v14" /></svg>
  </button>
{/if}
