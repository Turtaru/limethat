<script lang="ts">
  import { replace } from 'svelte-spa-router';
  import { Button, Dialog, PageHeading } from '../lib/ui-kit';
  import { eventPhotoTransition } from './event-photo-transition.svelte';
  import { labelKey } from '../lib/archive-format';
  import { useSession } from './session.svelte';
  import Connection from './Connection.svelte';
  import { pictureName } from './models';
  import ArchivePicture from './ArchivePicture.svelte';
  import Timeline from './Timeline.svelte';
  let { params = {} }: { params?: Record<string, string> } = $props();
  const session = useSession();
  const summary = $derived(session.workspace.summary);
  const label = $derived(summary?.labels.find(item => labelKey(item.id) === params.id));
  const events = $derived(summary?.events.filter(event => event.tags.some(tag => tag.id === params.id)) ?? []);
  let confirmDelete = $state(false);
  let deleting = $state(false);
  let error = $state('');
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
    <div class="ui-detail-toolbar"><a class="ui-button ui-button--quiet" href={session.navigation.origin(`#/labels/${encodeURIComponent(params.id)}`, '#/labels')} data-restore-label-list>← All labels</a>{#if label}<Button variant="quiet" class="ui-delete-action" disabled={!session.canWrite} onclick={() => { error = ''; confirmDelete = true; }}>Delete</Button>{/if}</div>
    {#if label}
      {@const name = pictureName(label.picture)}
      {@const selected = eventPhotoTransition.kind === 'label' && eventPhotoTransition.eventId === labelKey(label.id)}
      {@const transitioning = selected && !!eventPhotoTransition.file && !eventPhotoTransition.returning}
      <div class="ui-detail-layout">
        {#if name}<div class="ui-stack ui-detail-media"><ArchivePicture {name} alt={label.title} frame={label.picture_frame} viewable transitionName={transitioning ? 'event-photo' : undefined} onready={transitioning ? eventPhotoTransition.ready ?? undefined : undefined} /></div>{/if}
        <header class="ui-detail-field ui-detail-content"><p class="ui-section-label">Label name</p><h1 class="ui-detail-title" tabindex="-1" style:view-transition-name={selected ? 'event-title' : 'none'}>{label.title}</h1></header>
      </div>
      <div class="ui-summary">{events.length} events with this label</div>
      <Timeline {events} />
    {:else if summary}<PageHeading title="Label not found" /><p class="ui-empty">This label is not in the connected archive.</p>{/if}
  </div>
{/if}
<Dialog bind:open={confirmDelete} title="Delete label?" dismissible={!deleting}>
  <p>This removes the label from every readable event. Pictures and verified backups remain. Unreadable events must be resolved first.</p>
  {#if error}<p class="ui-error" role="alert">{error}</p>{/if}
  {#if !session.canWrite && !deleting}<Connection compact />{/if}
  {#snippet footer()}<div class="ui-actions"><Button disabled={deleting} onclick={() => { confirmDelete = false; }}>Cancel</Button><Button variant="danger" disabled={deleting || !session.canWrite} onclick={remove}>{deleting ? 'Deleting…' : 'Delete label'}</Button></div>{/snippet}
</Dialog>
