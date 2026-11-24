<script lang="ts">
  import type { HTMLAnchorAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  let { href, name, count, image, picture, titleTransitionName, onclick }: {
    href: string;
    name: string;
    count: number;
    image?: string;
    picture?: Snippet;
    titleTransitionName?: string;
    onclick?: HTMLAnchorAttributes['onclick'];
  } = $props();
</script>

<a class="ui-label-row" {href} {onclick}>
  <span class="ui-label-row__symbol" aria-hidden="true">
    {#if picture}{@render picture()}{:else if image}<img src={image} alt="" loading="lazy">{:else}#{/if}
  </span>
  <span class="ui-label-row__info">
    <span class="ui-label-row__title" style:view-transition-name={titleTransitionName ?? 'none'}>{name}</span>
    <span class="ui-label-row__count">{count} {count === 1 ? 'event' : 'events'}</span>
  </span>
</a>
