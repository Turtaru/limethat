<script lang="ts">
  import { replace } from 'svelte-spa-router';
  import { Button, Dialog, LabelLink, PageHeading } from '../lib/ui-kit';
  import { photoNames } from '../lib/archive-format';
  import { useSession } from './session.svelte';
  import Connection from './Connection.svelte';
  import { description, eventDates, labelHref } from './models';
  import ArchivePicture from './ArchivePicture.svelte';
  import Markdown from '../lib/ui-kit/ui/Markdown.svelte';
  import { eventPhotoTransition } from './event-photo-transition.svelte';
  let { params = {} }: { params?: Record<string, string> } = $props();
  const session = useSession();
  const summary = $derived(session.workspace.summary);
  const event = $derived(summary?.events.find(item => item.id.toLowerCase() === params.id?.toLowerCase()));
  let deleting = $state(false);
  let confirmDelete = $state(false);
  let error = $state('');
  async function remove() {
    if (!event || !session.canWrite || deleting) return;
    deleting = true; error = '';
    try {
      session.result(await session.workspace.deleteEvent(event));
      confirmDelete = false;
      void replace('/events');
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Delete failed.'; }
    finally { deleting = false; }
  }
</script>

{#if params.id}
  <div class="ui-stack">
    <div class="ui-detail-toolbar"><a class="ui-button ui-button--quiet" href={session.navigation.origin(`#/events/${encodeURIComponent(params.id)}`, '#/events')} data-restore-event-list>← Back</a>{#if event}<Button variant="quiet" class="ui-delete-action" disabled={!session.canWrite} onclick={() => { confirmDelete = true; error = ''; }}>Delete</Button>{/if}</div>
    {#if event}
      {#if session.eventSaving(event.id)}<p class="ui-status" role="status">Saving changes affecting this event. Editing is temporarily unavailable.</p>{/if}
      <div class="ui-detail-layout">
        <div class="ui-stack ui-detail-media">
          {#each photoNames(event.body) as name, index (name)}
            {@const transitioning = index === 0 && eventPhotoTransition.kind === 'event' && !!eventPhotoTransition.file && !eventPhotoTransition.returning && eventPhotoTransition.eventId === event.id}
            <ArchivePicture {name} alt={event.title} frame={event.frames[name]} viewable transitionName={transitioning ? 'event-photo' : undefined} onready={transitioning ? eventPhotoTransition.ready ?? undefined : undefined} />
          {/each}
          <section class="ui-detail-field" aria-label="Labels">
            <h2 class="ui-section-label">Labels</h2>
            <div class="ui-cluster">{#each event.tags as tag}<LabelLink name={tag.title} href={labelHref(tag.id)} />{/each}</div>
          </section>
        </div>
        <div class="ui-stack ui-detail-content">
          <div class="ui-detail-field"><p class="ui-section-label">Date</p><p class="ui-description">{eventDates(event)}</p></div>
          <header class="ui-detail-field"><p class="ui-section-label">Title</p><h1 class="ui-detail-title" tabindex="-1" style:view-transition-name={eventPhotoTransition.kind === 'event' && eventPhotoTransition.eventId === event.id ? 'event-title' : 'none'}>{event.title}</h1></header>
          <section class="ui-detail-field" aria-label="Description"><h2 class="ui-section-label">Description</h2><Markdown source={description(event.body) || 'No description added.'} /></section>
        </div>
      </div>
    {:else if summary}<PageHeading title="Event not found" /><p class="ui-empty">This event is not in the connected archive.</p>{/if}
  </div>
{/if}
<Dialog bind:open={confirmDelete} title="Delete event?" dismissible={!deleting}>
  <p>The event will be removed. Its pictures and verified recovery backup will remain in the archive.</p>
  {#if error}<p class="ui-error" role="alert">{error}</p>{/if}
  {#if !session.canWrite && !deleting}<Connection compact />{/if}
  {#snippet footer()}<div class="ui-actions"><Button disabled={deleting} onclick={() => { confirmDelete = false; }}>Cancel</Button><Button variant="danger" disabled={deleting || !session.canWrite} onclick={remove}>{deleting ? 'Deleting…' : 'Delete event'}</Button></div>{/snippet}
</Dialog>
