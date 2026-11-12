<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from './Button.svelte';

  type Props = {
    open?: boolean;
    title: string;
    variant?: 'modal' | 'sheet' | 'screen' | 'viewer' | 'editor';
    dismissible?: boolean;
    closeLabel?: string;
    onclose?: () => void;
    onkeydown?: (event: KeyboardEvent) => void;
    actions?: Snippet;
    footer?: Snippet;
    dock?: Snippet;
    children: Snippet;
  };

  let { open = $bindable(false), title, variant = 'modal', dismissible = true, closeLabel = '← Back', onclose, onkeydown, actions, footer, dock, children }: Props = $props();
  let element: HTMLDialogElement | undefined = $state();
  const titleId = $props.id();

  $effect(() => {
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  });
</script>

<dialog bind:this={element} class={`ui-dialog ui-dialog--${variant}`} aria-labelledby={titleId} {onkeydown}
  oncancel={(event) => { if (!dismissible) event.preventDefault(); }}
  onclose={() => { open = false; onclose?.(); }}>
  <header class="ui-dialog__header ui-stack">
    <div class="ui-toolbar">
      <Button variant="quiet" disabled={!dismissible} onclick={() => { open = false; }}>{closeLabel}</Button>
      {#if actions}{@render actions()}{/if}
    </div>
    <h2 class="ui-dialog__heading" id={titleId}>{title}</h2>
  </header>
  <div class="ui-dialog__body">{@render children()}</div>
  {#if footer}<footer class="ui-dialog__footer">{@render footer()}</footer>{/if}
  {#if dock}{@render dock()}{/if}
</dialog>
