<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Props = HTMLButtonAttributes & {
    variant?: 'primary' | 'secondary' | 'danger' | 'quiet';
    round?: boolean;
    children: Snippet;
  };

  let { variant = 'secondary', round = false, type = 'button', class: className = '', children, ...attributes }: Props = $props();
</script>

<button {...attributes} {type} class={`ui-button ui-button--${variant} ${round ? 'ui-button--round' : ''} ${className}`}>
  {@render children()}
</button>
