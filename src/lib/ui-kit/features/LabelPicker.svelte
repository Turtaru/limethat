<script lang="ts">
  import { tick, untrack, type Snippet } from 'svelte';
  import Button from '../ui/Button.svelte';
  import Dialog from '../ui/Dialog.svelte';
  import Field from '../ui/Field.svelte';
  import type { DockAction, LabelOption } from '../types';

  type Props = {
    open?: boolean;
    labels: LabelOption[];
    selected?: string[];
    oncreate?: (name: string) => LabelOption | Promise<LabelOption>;
    dock?: Snippet<[DockAction]>;
  };

  let { open = $bindable(false), labels, selected = $bindable([]), oncreate, dock: renderDock }: Props = $props();
  let query = $state('');
  let limit = $state(10);
  let creating = $state(false);
  let error = $state('');
  let input: HTMLInputElement | undefined = $state();
  let results: HTMLDivElement | undefined = $state();
  let createButton: HTMLButtonElement | undefined = $state();
  const searchId = $props.id();
  const normalized = $derived(query.trim().toLocaleLowerCase());
  const matches = $derived(labels.filter(label => !selected.includes(label.id) && label.name.toLocaleLowerCase().includes(normalized)).sort((a, b) => a.name.localeCompare(b.name)));
  const canCreate = $derived(Boolean(oncreate && normalized && !labels.some(label => label.name.toLocaleLowerCase() === normalized)));

  $effect(() => {
    if (open) untrack(() => { query = ''; limit = 10; error = ''; });
  });

  function add(id: string) {
    if (!selected.includes(id)) selected = [...selected, id];
    input?.focus();
  }

  async function showMore() {
    const previous = limit;
    limit += 10;
    await tick();
    results?.querySelectorAll('button')[previous]?.focus();
  }

  async function create() {
    if (!oncreate || !canCreate || creating) return;
    creating = true;
    error = '';
    try {
      const label = await oncreate(query.trim());
      add(label.id);
      query = '';
      limit = 10;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not create this label. Try again.';
    } finally {
      creating = false;
      await tick();
      input?.focus();
    }
  }
</script>

<Dialog bind:open title="Add labels" variant="sheet" dismissible={!creating}>
  <div class="ui-stack">
    <Field id={searchId} label="Find a label" {error} help={oncreate ? 'Search existing labels or create a new name.' : 'Search existing labels to add to your selection.'}>
      {#snippet children(control)}
        <input bind:this={input} class="ui-input" id={control.id} type="search" maxlength="200" autocomplete="off" enterkeyhint="search"
          bind:value={query} aria-describedby={control.describedby} aria-invalid={control.invalid} disabled={creating}
          oninput={() => { limit = 10; }}
          onkeydown={(event) => {
            if (event.key === 'Enter' && !event.isComposing) {
              event.preventDefault();
              (results?.querySelector('button') || createButton || input)?.focus();
            }
          }}>
      {/snippet}
    </Field>
    <p class="ui-muted" role="status">{Math.min(matches.length, limit)} of {matches.length} labels. {selected.length} selected.</p>
    <div class="ui-label-options" bind:this={results}>
      {#each matches.slice(0, limit) as label (label.id)}
        <div class="ui-label-option"><span>{label.name}</span><Button onclick={() => add(label.id)} aria-label={`Add label: ${label.name}`}>Add</Button></div>
      {/each}
    </div>
    {#if matches.length > limit}<Button onclick={showMore}>Show more labels</Button>{/if}
    {#if canCreate}
      <button bind:this={createButton} type="button" class="ui-button" disabled={creating} onclick={create}>{creating ? 'Creating…' : `Create “${query.trim()}”`}</button>
    {/if}
    <p class="ui-muted">Selections stay in the draft until its owner saves them.</p>
  </div>
  {#snippet footer()}
    {#if renderDock}{@render renderDock({ label: 'Done adding labels', icon: 'save', disabled: creating, onclick: () => { open = false; } })}
    {:else}<div class="ui-actions"><Button variant="primary" disabled={creating} onclick={() => { open = false; }}>Done</Button></div>{/if}
  {/snippet}
</Dialog>
