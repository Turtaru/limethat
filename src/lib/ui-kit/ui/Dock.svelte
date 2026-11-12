<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { DockAction } from '../types';
  let { children, label, icon = 'create', disabled = false, type = 'button', form, onclick }: {
    children: Snippet;
  } & DockAction = $props();
  const paths = {
    create: 'M12 5v14M5 12h14',
    edit: 'm4 16 12-12 4 4-12 12H4v-4ZM13 7l4 4',
    save: 'm5 12 4 4L19 6',
    reset: 'M4 10a8 8 0 1 1 1 8M4 4v6h6',
    folder: 'M3 7V5h7l2 2h9v13H3V7Z',
  };
</script>
<div class="ui-dock">
  {@render children()}
  <button class="ui-dock__action" {type} {form} {disabled} {onclick} aria-label={label} title={label}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[icon]} /></svg>
  </button>
</div>
