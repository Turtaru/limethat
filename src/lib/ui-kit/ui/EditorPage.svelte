<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from './Button.svelte';
  import Dialog from './Dialog.svelte';
  let { title, saving = false, oncancel, children, footer }: {
    title: string; saving?: boolean; oncancel: () => void; children: Snippet; footer?: Snippet;
  } = $props();
</script>
<section class="ui-editor-page">
  <header class="ui-detail-toolbar"><Button variant="quiet" disabled={saving} onclick={oncancel}>← Cancel</Button></header>
  <h1 class="ui-editor-page__title">{title}</h1>
  {@render children()}
  {#if footer}{@render footer()}{/if}
</section>
{#if saving}
  <Dialog open dismissible={false} title="Saving changes…">
    <p>Keep this page open while the archive is updated.</p>
    <progress aria-label="Saving changes"></progress>
  </Dialog>
{/if}
