<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from './Button.svelte';
  let { title, disabled = false, oncancel, children, footer }: {
    title: string; disabled?: boolean; oncancel: () => void; children: Snippet; footer?: Snippet;
  } = $props();
</script>
<section class="ui-editor-page">
  <header class="ui-detail-toolbar"><Button variant="quiet" disabled={disabled} onclick={oncancel}>← Cancel</Button></header>
  <h1 class="ui-editor-page__title">{title}</h1>
  {@render children()}
  {#if footer}{@render footer()}{/if}
</section>
