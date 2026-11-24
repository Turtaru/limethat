<script lang="ts">
  import { router, replace } from 'svelte-spa-router';
  import { Button, Dialog, Field, LabelRow, PageHeading, ResultCount } from '../lib/ui-kit';
  import { labelKey } from '../lib/archive-format';
  import { useSession } from './session.svelte';
  import Connection from './Connection.svelte';
  import { labelCount, labelHref, pictureName } from './models';
  import ArchivePicture from './ArchivePicture.svelte';
  import Timeline from './Timeline.svelte';
  let { params = {} }: { params?: Record<string, string> } = $props();
  const session = useSession();
  const summary = $derived(session.workspace.summary);
  const label = $derived(summary?.labels.find(item => labelKey(item.id) === params.id));
  const events = $derived(summary?.events.filter(event => event.tags.some(tag => tag.id === params.id)) ?? []);
  let query = $state(new URLSearchParams(router.querystring).get('q') ?? '');
  let confirmDelete = $state(false);
  let deleting = $state(false);
  let error = $state('');
  const matches = $derived((summary?.labels ?? []).filter(item => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => a.title.localeCompare(b.title)));
  $effect(() => { query = new URLSearchParams(router.querystring).get('q') ?? ''; });
  async function remove() {
    if (!label || !session.canWrite || deleting) return;
    deleting = true; error = '';
    try {
      session.result(await session.workspace.deleteLabel(labelKey(label.id)));
      confirmDelete = false; void replace('/labels');
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Delete failed.'; }
    finally { deleting = false; }
  }
</script>
{#if params.id}
  <div class="ui-stack">
    <div class="ui-detail-toolbar"><a class="ui-button ui-button--quiet" href="#/labels">← All labels</a>{#if label}<Button variant="quiet" class="ui-delete-action" disabled={!session.canWrite} onclick={() => { error = ''; confirmDelete = true; }}>Delete</Button>{/if}</div>
    {#if label}
      {@const name = pictureName(label.picture)}
      <div class="ui-detail-layout">
        {#if name}<div class="ui-stack ui-detail-media"><ArchivePicture {name} alt={label.title} frame={label.picture_frame} viewable thumbnail={false} /></div>{/if}
        <header class="ui-detail-field ui-detail-content"><p class="ui-section-label">Label name</p><h1 class="ui-detail-title">{label.title}</h1></header>
      </div>
      <div class="ui-summary">{events.length} events with this label</div>
      <Timeline {events} />
    {:else if summary}<PageHeading title="Label not found" /><p class="ui-empty">This label is not in the connected archive.</p>{/if}
  </div>
{:else}
  <div class="ui-stack ui-label-directory">
    <h1 class="ui-sr-only">Labels</h1>
    <div class="ui-timeline-toolbar ui-timeline-toolbar--with-count">
      <div class="ui-search ui-search--compact"><Field label="Search labels">{#snippet children(control)}<input class="ui-input" id={control.id} type="search" bind:value={query} placeholder="Search labels" oninput={() => { history.replaceState(history.state, '', `#/labels${query ? `?q=${encodeURIComponent(query)}` : ''}`); }}>{/snippet}</Field></div>
      <ResultCount count={matches.length} singular="label" />
    </div>
    <ul class="ui-label-list">
      {#each matches as item (labelKey(item.id))}
        {@const name = pictureName(item.picture)}
        <li>
          {#snippet image()}{#if name}<ArchivePicture {name} alt={item.title} frame={item.picture_frame} />{/if}{/snippet}
          <LabelRow name={item.title} count={summary ? labelCount(summary, labelKey(item.id)) : 0} href={labelHref(labelKey(item.id))} picture={name ? image : undefined} />
        </li>
      {:else}<li><p class="ui-empty">No matching labels.</p></li>{/each}
    </ul>
  </div>
{/if}
<Dialog bind:open={confirmDelete} title="Delete label?" dismissible={!deleting}>
  <p>This removes the label from every readable event. Pictures and verified backups remain. Unreadable events must be resolved first.</p>
  {#if error}<p class="ui-error" role="alert">{error}</p>{/if}
  {#if !session.canWrite && !deleting}<Connection compact />{/if}
  {#snippet footer()}<div class="ui-actions"><Button disabled={deleting} onclick={() => { confirmDelete = false; }}>Cancel</Button><Button variant="danger" disabled={deleting || !session.canWrite} onclick={remove}>{deleting ? 'Deleting…' : 'Delete label'}</Button></div>{/snippet}
</Dialog>
