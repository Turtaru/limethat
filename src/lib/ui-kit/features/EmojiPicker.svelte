<script lang="ts">
  import { onMount } from 'svelte';
  import emojiDataUrl from 'emoji-picker-element-data/en/emojibase/data.json?url';
  import Field from '../ui/Field.svelte';
  import Button from '../ui/Button.svelte';

  type Emoji = { emoji: string; annotation: string; tags?: string[]; shortcodes?: string[] };
  let { selected, onselect }: { selected: string; onselect: (emoji: string) => void } = $props();
  let query = $state('');
  let emojis = $state<Emoji[]>([]);
  let recent = $state<string[]>([]);
  let error = $state('');
  let loading = $state(true);
  const storageKey = 'limethat-recent-emojis';
  const suggested = new Set(['😀', '❤️', '🎉', '🎂', '📚', '🎬', '🎵', '🎮', '✈️', '🏖️', '🏕️', '🏔️', '🏠', '👨‍👩‍👧‍👦', '🐶', '🐱', '🍽️', '☕', '🍕', '🍷', '🌱', '🌸', '☀️', '🌈', '🏃', '🚴', '⚽', '🏆', '💼', '🎓', '💡', '📷']);
  const normalized = $derived(query.trim().toLocaleLowerCase());
  const matches = $derived(emojis.filter(item => normalized
    ? [item.emoji, item.annotation, ...(item.tags ?? []), ...(item.shortcodes ?? [])].some(text => text.toLocaleLowerCase().includes(normalized))
    : suggested.has(item.emoji)));
  const recentEmojis = $derived(recent.flatMap(emoji => {
    const item = emojis.find(item => item.emoji === emoji);
    return item ? [item] : [];
  }));

  onMount(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      if (Array.isArray(stored)) recent = [...new Set(stored.filter((item): item is string => typeof item === 'string'))].slice(0, 16);
    } catch { recent = []; }
    const controller = new AbortController();
    void fetch(emojiDataUrl, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Could not load emoji data. Close the picker and try again.');
      emojis = await response.json();
    }).catch(cause => {
      if (!controller.signal.aborted) error = cause instanceof Error ? cause.message : 'Could not load emoji data.';
    }).finally(() => { loading = false; });
    return () => controller.abort();
  });

  function choose(emoji: string) {
    recent = [emoji, ...recent.filter(item => item !== emoji)].slice(0, 16);
    try { localStorage.setItem(storageKey, JSON.stringify(recent)); } catch {}
    onselect(emoji);
  }
</script>

<div class="ui-emoji-picker ui-stack">
  <search>
    <Field label="Search emoji">
      {#snippet children(control)}<input class="ui-input" id={control.id} type="search" bind:value={query} autocomplete="off" spellcheck="false">{/snippet}
    </Field>
  </search>
  {#if error}<p class="ui-error" role="alert">{error}</p>
  {:else if loading}<p class="ui-muted" role="status">Loading emoji…</p>
  {:else}
    {#if recentEmojis.length}
      <section class="ui-emoji-section" aria-label="Recently used">
        <h3 class="ui-emoji-section__heading">Recently used</h3>
        <div class="ui-emoji-options">
          {#each recentEmojis as item (item.emoji)}
            <Button class="ui-emoji-option" aria-label={item.annotation} title={item.annotation} aria-pressed={selected === item.emoji} onclick={() => choose(item.emoji)}>{item.emoji}</Button>
          {/each}
        </div>
      </section>
    {/if}
    <section class="ui-emoji-section" aria-label={normalized ? 'Search results' : 'Suggested emoji'}>
      <h3 class="ui-emoji-section__heading">{normalized ? 'Search results' : 'Suggested'}</h3>
      <div class="ui-emoji-results" role="region" aria-label="Emoji results">
        {#if !matches.length}<p class="ui-muted" role="status">No emoji found.</p>{/if}
        <div class="ui-emoji-options">
          {#each matches as item (item.emoji)}
            <Button class="ui-emoji-option" aria-label={item.annotation} title={item.annotation} aria-pressed={selected === item.emoji} onclick={() => choose(item.emoji)}>{item.emoji}</Button>
          {/each}
        </div>
      </div>
    </section>
  {/if}
</div>
