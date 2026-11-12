<script lang="ts">
  import type { Snippet } from 'svelte';

  type Control = { id: string; describedby: string | undefined; invalid: true | undefined };
  type Props = {
    id?: string;
    label: string;
    help?: string;
    error?: string;
    children: Snippet<[Control]>;
  };

  const instanceId = $props.id();
  let { id = instanceId, label, help, error, children }: Props = $props();
  const describedby = $derived([help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined);
</script>

<div class="ui-field">
  <label class="ui-field__label" for={id}>{label}</label>
  {@render children({ id, describedby, invalid: error ? true : undefined })}
  {#if help}<p class="ui-field__help" id={`${id}-help`}>{help}</p>{/if}
  {#if error}<p class="ui-field__error" id={`${id}-error`} role="alert">{error}</p>{/if}
</div>
