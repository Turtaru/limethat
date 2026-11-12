<script lang="ts">
  import { onMount, tick } from 'svelte';

  let { items, label = 'Main navigation', onclick }: {
    items: { href: string; label: string; current?: boolean }[];
    label?: string;
    onclick?: (event: MouseEvent) => void;
  } = $props();
  let navigation: HTMLElement;
  let indicator = $state.raw<{ x: number; y: number; width: number; height: number } | null>(null);

  function measure() {
    const active = navigation.querySelector<HTMLElement>('[aria-current="page"]');
    indicator = active?.offsetWidth ? { x: active.offsetLeft, y: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight } : null;
  }

  onMount(() => {
    const observer = new ResizeObserver(measure);
    observer.observe(navigation);
    measure();
    return () => observer.disconnect();
  });

  $effect(() => {
    items.map(item => item.current);
    let active = true;
    void tick().then(() => { if (active) measure(); });
    return () => { active = false; };
  });
</script>

<nav bind:this={navigation} class="ui-navigation" aria-label={label}>
  {#if indicator}
    <span class="ui-navigation__indicator" aria-hidden="true" style:transform={`translate(${indicator.x}px, ${indicator.y}px)`} style:width={`${indicator.width}px`} style:height={`${indicator.height}px`}></span>
  {/if}
  {#each items as item}
    <a class="ui-navigation__link" href={item.href} {onclick} aria-current={item.current ? 'page' : undefined}>{item.label}</a>
  {/each}
</nav>
