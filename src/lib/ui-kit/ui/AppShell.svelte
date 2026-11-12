<script lang="ts">
  import type { Snippet } from 'svelte';

  let { header, footer, children }: { header?: Snippet; footer?: Snippet; children: Snippet } = $props();
  const contentId = $props.id();
</script>

<a class="ui-skip-link" href={`#${contentId}`} onclick={(event) => { event.preventDefault(); document.getElementById(contentId)?.focus(); }}>Skip to content</a>
<div class="ui-shell">
  <header>{#if header}{@render header()}{/if}</header>
  <main class="ui-shell__main" id={contentId} tabindex="-1">{@render children()}</main>
  <footer class="ui-shell__footer">{#if footer}{@render footer()}{/if}</footer>
</div>
