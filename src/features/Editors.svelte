<script lang="ts">
  import { untrack } from 'svelte';
  import { router, replace } from 'svelte-spa-router';
  import Connection from './Connection.svelte';
  import AppDock from './AppDock.svelte';
  import FramePicture from './FramePicture.svelte';
  import { EventEditor, PageHeading } from '../lib/ui-kit';
  import LabelEditor from '../lib/ui-kit/features/LabelEditor.svelte';
  import type { EventDraft, LabelEditorDraft } from '../lib/ui-kit/types';
  import { labelKey, photoNames, validateDate } from '../lib/archive-format';
  import { useSession, type EventPageDraft, type LabelPageDraft } from './session.svelte';
  import { eventDraft, eventHref, labelHref, pictureName } from './models';
  let { params = {} }: { params?: Record<string, string> } = $props();
  const session = useSession();
  const section = $derived(router.location.startsWith('/labels') ? 'labels' : 'events');
  let eventPage = $state.raw<EventPageDraft | null>(null);
  let labelPage = $state.raw<LabelPageDraft | null>(null);
  let missing = $state(false);
  let closedRoute = $state<string | null>(null);

  $effect(() => {
    const key = router.location;
    const kind = section;
    const id = params.id;
    const summary = session.workspace.summary;
    if (closedRoute === key) return;
    eventPage = null; labelPage = null; missing = false;
    if (!summary) return;
    untrack(() => {
      if (kind === 'events') {
        const original = id ? summary.events.find(item => item.id.toLowerCase() === id.toLowerCase()) : null;
        if (id && !original && !session.eventDrafts.has(key)) { missing = true; return; }
        eventPage = session.eventDraft(key, original ?? null);
      } else {
        const original = id ? summary.labels.find(item => labelKey(item.id) === id) : null;
        if (id && !original && !session.labelDrafts.has(key)) { missing = true; return; }
        labelPage = session.labelDraft(key, original ?? null);
      }
    });
  });
  const labels = $derived.by(() => {
    const options = (session.workspace.summary?.labels ?? []).map(label => ({ id: labelKey(label.id), name: label.title }));
    for (const tag of eventPage?.original?.tags ?? []) if (!options.some(label => label.id === tag.id)) options.push({ id: tag.id, name: tag.title });
    return options;
  });

  function cancel() {
    if (session.workspace.operation) return;
    const destination = section === 'events' ? eventPage?.original ? eventHref(eventPage.original.id) : '/events' : labelPage?.original ? labelHref(labelKey(labelPage.original.id)) : '/labels';
    closedRoute = router.location;
    session.discardDraft(router.location);
    void replace(destination);
  }

  async function saveEvent(draft: EventDraft) {
    const page = eventPage;
    const key = router.location;
    if (!page || !session.canWrite || !session.workspace.summary || page.blocked) throw new Error('Reconnect or refresh before saving.');
    const fieldErrors: Record<string, string> = {};
    for (const [field, value] of [['date', draft.date], ['endDate', draft.endDate]]) {
      try {
        if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Incomplete date');
        validateDate(value || null);
      } catch { fieldErrors[field] = 'Enter a valid YYYY-MM-DD date.'; }
    }
    if (Object.keys(fieldErrors).length) throw Object.assign(new Error('Check the date fields.'), { fieldErrors });
    try {
      const imported: string[] = [];
      for (const file of draft.pictures) imported.push(await page.pictures.import(file));
      const complete = eventDraft(draft, page.original, session.workspace.summary, imported);
      complete.frames = { ...page.frames };
      imported.forEach((name, index) => { complete.frames[name] = page.pictures.frame(draft.pictures[index]); });
      const outcome = await (page.original ? session.workspace.updateEvent(page.original, complete) : session.workspace.createEvent(complete));
      const saved = session.result(outcome);
      closedRoute = key;
      session.discardDraft(key);
      if (router.location === key) await replace(outcome.status === 'saved' && outcome.refresh === 'ready' ? eventHref(saved.id) : '/events');
    } catch (cause) { if (session.reviewRequired) page.blocked = true; throw cause; }
  }

  async function saveLabel(draft: LabelEditorDraft) {
    const page = labelPage;
    const key = router.location;
    if (!page || !session.canWrite || page.blocked) throw new Error('Reconnect or refresh before saving.');
    const original = page.original;
    try {
      const imported = draft.picture ? await page.pictures.import(draft.picture) : null;
      const picture = imported ? `attachments/${imported}` : draft.removePicture ? undefined : original?.picture;
      const complete = { title: draft.name, picture, picture_frame: imported && draft.picture ? page.pictures.frame(draft.picture) : draft.removePicture ? undefined : page.frame };
      const outcome = await (original ? session.workspace.updateLabel(labelKey(original.id), complete) : session.workspace.createLabel(complete));
      const saved = session.result(outcome);
      closedRoute = key;
      session.discardDraft(key);
      if (router.location === key) await replace(outcome.status === 'saved' && outcome.refresh === 'ready' ? labelHref(labelKey(saved.id)) : '/labels');
    } catch (cause) { if (session.reviewRequired) page.blocked = true; throw cause; }
  }
</script>

{#if eventPage}
  {@const page = eventPage}
  <EventEditor bind:draft={page.value} heading={page.original ? 'Edit event' : 'New event'} pictures={page.original ? photoNames(page.original.body).map(name => ({ id: name, name })) : []} {labels} disabled={!session.canWrite || page.blocked} preparing={page.pictures.pending > 0} onsave={saveEvent} oncancel={cancel}>
    {#snippet pictureEditor(locked)}
      {#each photoNames(page.original?.body ?? '').filter(name => !page.value.removedPictureIds.includes(name)) as name (name)}
        <FramePicture {name} alt={`${page.value.title || 'Event'}: ${name}`} frame={page.frames[name]} pictures={page.pictures} disabled={locked} onchange={frame => { page.frames = { ...page.frames, [name]: { ...page.frames[name], ...frame } }; }} onselect={file => { page.value.removedPictureIds = [...page.value.removedPictureIds, name]; page.value.pictures = [...page.value.pictures, file]; }} />
      {/each}
      {#each page.value.pictures as file (file)}
        <FramePicture {file} alt={file.name} frame={page.pictures.frame(file)} pictures={page.pictures} disabled={locked} onchange={frame => page.pictures.frames.set(file, frame)} onselect={replacement => { page.value.pictures = page.value.pictures.map(current => current === file ? replacement : current); }} />
      {/each}
      {#if !page.value.pictures.length && !photoNames(page.original?.body ?? '').some(name => !page.value.removedPictureIds.includes(name))}
        <FramePicture alt={page.value.title || 'Event picture'} pictures={page.pictures} disabled={locked} onchange={() => {}} onselect={file => { page.value.pictures = [file]; }} />
      {/if}
    {/snippet}
    {#snippet dock(action)}<AppDock section="events" {...action} />{/snippet}
    {#snippet recovery()}{#if page.blocked}<p class="ui-error">This draft may already be partially saved. Inspect the archive, then cancel this draft and reopen the current record. Do not repeat the save.</p>{/if}<Connection compact />{/snippet}
  </EventEditor>
{:else if labelPage}
  {@const page = labelPage}
  <LabelEditor bind:draft={page.value} editing={!!page.original} hasPicture={!!page.original?.picture} disabled={!session.canWrite || page.blocked} preparing={page.pictures.pending > 0} onsave={saveLabel} oncancel={cancel}>
    {#snippet pictureEditor(locked)}
      {#if page.value.picture}
        <FramePicture file={page.value.picture} alt={page.value.picture.name} frame={page.pictures.frame(page.value.picture)} pictures={page.pictures} disabled={locked} onchange={frame => { if (page.value.picture) page.pictures.frames.set(page.value.picture, frame); }} onselect={file => { page.value.picture = file; }} />
      {:else}
        <FramePicture name={page.value.removePicture ? undefined : pictureName(page.original?.picture)} alt={page.value.name || 'Label picture'} frame={page.frame} pictures={page.pictures} disabled={locked} onchange={frame => { page.frame = { ...page.frame, ...frame }; }} onselect={file => { page.value.picture = file; }} />
      {/if}
    {/snippet}
    {#snippet dock(action)}<AppDock section="labels" {...action} />{/snippet}
    {#snippet recovery()}{#if page.blocked}<p class="ui-error">This change may already be partially saved. Inspect the archive, then cancel this draft and reopen the current label. Do not repeat the save.</p>{/if}<Connection compact />{/snippet}
  </LabelEditor>
{:else if missing}
  <div class="ui-stack"><PageHeading title={section === 'events' ? 'Event not found' : 'Label not found'} /><a class="ui-button" href={`#/${section}`}>Back</a></div>
{:else}<p class="ui-muted">Connect an archive to open this editor.</p>{/if}
{#if !eventPage && !labelPage}<AppDock {section} label={section === 'events' ? 'Save event' : 'Save label'} icon="save" disabled />{/if}
