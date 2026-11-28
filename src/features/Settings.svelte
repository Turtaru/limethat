<script lang="ts">
  import { Button, Field, PageHeading } from '../lib/ui-kit';
  import { useSession } from './session.svelte';
  import { pwa, applyUpdate } from './pwa.svelte';
  import Connection from './Connection.svelte';
  import LoadingDiagnostics from './LoadingDiagnostics.svelte';
  import { needsRelatedEventsTranslation, relatedEventGroups } from '../lib/related-events';
  import { failure } from '../lib/errors';
  const session = useSession();
  const build = __APP_BUILD__;
  const summary = $derived(session.workspace.summary);
  const translation = $derived.by(() => {
    if (session.workspace.translationRecovery || !summary || !needsRelatedEventsTranslation(summary)) return null;
    try {
      const groups = relatedEventGroups(summary.events);
      return { groups: groups.length, events: groups.reduce((count, group) => count + group.length, 0), error: '' };
    } catch (error) { return { groups: 0, events: 0, error: failure(error).message }; }
  });
  async function translateRelatedEvents() {
    if (!session.canWrite || session.draftCount || summary?.unreadableEvents.length || translation?.error) return;
    try { session.result(await session.workspace.translateRelatedEvents()); }
    catch (error) { session.notice = failure(error).message; }
  }
  async function rollbackRelatedEvents() {
    if (session.workspace.operation || pwa.activating || session.draftCount) return;
    try {
      session.result(await session.workspace.rollbackRelatedEvents());
      session.reviewRequired = false;
      if (session.workspace.state === 'ready') session.notice = 'Migration rolled back. You can retry.';
    } catch (error) { session.notice = failure(error).message; }
  }
  async function createThumbnails() {
    if (!session.canWrite || session.draftCount) return;
    try { await session.workspace.createMissingThumbnails(); }
    catch (error) { session.notice = failure(error).message; }
  }
  async function clearEvents() {
    try { await session.workspace.clearEventCache(); session.notice = session.workspace.snapshotWarning || 'Event cache cleared. Archive files are unchanged.'; }
    catch (error) { session.notice = failure(error).message; }
  }
  async function clearPictures() {
    try { await session.workspace.clearPictureCache(); session.notice = session.workspace.pictureCacheWarning || 'Picture cache cleared. Archive files are unchanged.'; }
    catch (error) { session.notice = failure(error).message; }
  }
  function themeChanged() {
    try { localStorage.setItem('limethat-theme', session.theme); }
    catch { session.notify('Theme changed, but this browser could not remember the preference.', 'warning'); }
  }
</script>
<div class="ui-stack">
  <PageHeading title="Settings" subtitle="Your archive and preferences." />
  <section class="ui-section ui-stack"><h2>System activity</h2><p class="ui-muted">Current work, errors, and this tab’s message history.</p><Button onclick={() => { session.activity.open = true; }}>Open system activity</Button></section>
  <section class="ui-section ui-stack"><h2>Archive connection</h2><Connection /></section>
  {#if session.workspace.translationRecovery}
    <section class="ui-section ui-stack">
      <h2>Unfinished migration</h2>
      <p id="migration-recovery">Restore the archive from verified backups before continuing. Keep other tools closed until recovery finishes. If recovery fails, reconnect or refresh and try rollback again; backups remain available.</p>
      {#if session.draftCount}<p class="ui-muted">Save elsewhere or cancel unsaved drafts before rollback.</p>{/if}
      <Button disabled={!!session.workspace.operation || pwa.activating || session.draftCount > 0 || session.workspace.permission !== 'granted'} aria-describedby="migration-recovery" onclick={rollbackRelatedEvents}>Roll back unfinished migration</Button>
    </section>
  {/if}
  {#if translation}
    <section class="ui-section ui-stack">
      <h2>Related events</h2>
      <p id="related-events-translation">Convert connected events into shared tags, including indirect connections. This will create {translation.groups} tags for {translation.events} events. Original relationships stay unchanged. Self-links are ignored. This runs once; later relationship changes are not translated.</p>
      <p class="ui-muted">Keep other tools closed during migration and recovery. Files receive verified backups. Failures trigger automatic rollback; after browser interruption, Settings offers recovery before editing or retrying.</p>
      {#if translation.error}<p class="ui-error" role="alert">{translation.error}</p>{/if}
      {#if summary?.unreadableEvents.length}<p class="ui-error">Resolve unreadable events before translating.</p>{/if}
      {#if session.draftCount}<p class="ui-muted">Save or cancel drafts before translating.</p>{/if}
      <Button disabled={!session.canWrite || session.draftCount > 0 || !!summary?.unreadableEvents.length || !!translation.error} aria-describedby="related-events-translation" onclick={translateRelatedEvents}>Convert related events to tags</Button>
    </section>
  {/if}
  <section class="ui-section ui-stack">
    <h2>Local event index</h2>
    <p>This device keeps a disposable event snapshot in IndexedDB. Reopening shows it immediately while the folder is checked in background. A new device builds its own index and shows events as they load. Archive files and their format stay unchanged.</p>
    <p class="ui-muted">Editing stays disabled until the folder check completes. Up to four archive snapshots are retained, at most 16 MiB each. Clearing the cache forces a rebuild on next opening.</p>
    {#if session.workspace.snapshotSavedAt}<p class="ui-muted">Last snapshot: {new Date(session.workspace.snapshotSavedAt).toLocaleString()}</p>{/if}
    <Button disabled={!!session.workspace.operation || session.pendingSaves.size > 0 || pwa.activating} onclick={clearEvents}>Clear event cache</Button>
  </section>
  <section class="ui-section ui-stack">
    <h2>Pictures</h2>
    <p>Create missing whole-image thumbnails beside originals in the archive. Originals and framing stay unchanged; existing thumbnails are skipped. Keep other tools closed. This can take time. After an abrupt close, remove any incomplete thumbnail before rerunning.</p>
    <Button disabled={!session.canWrite || session.draftCount > 0} onclick={createThumbnails}>Create missing thumbnails</Button>
    <Button onclick={() => { session.activity.open = true; }}>View progress and results</Button>
    <p class="ui-muted">Pictures use a disposable browser cache, limited to 64 MiB across archives. Cached pictures show immediately; when shown again, they are checked against the folder in background, at most once every 30 seconds. Clearing it never changes archive files.</p>
    <Button disabled={!!session.workspace.operation || session.pendingSaves.size > 0 || pwa.activating} onclick={clearPictures}>Clear picture cache</Button>
    {#if session.workspace.pictureCacheWarning}<p class="ui-error" role="status">{session.workspace.pictureCacheWarning}</p>{/if}
  </section>
  <section class="ui-section"><Field label="Color theme">{#snippet children(control)}<select class="ui-input" id={control.id} bind:value={session.theme} onchange={themeChanged}><option value="dark">Dark</option><option value="light">Light</option></select>{/snippet}</Field></section>
  <section class="ui-section ui-stack"><h2>App version</h2><p class="ui-muted">Build: {build}</p></section>
  <section class="ui-section ui-stack"><h2>Loading diagnostics</h2><LoadingDiagnostics /></section>
  {#if pwa.update}<Button disabled={session.draftCount > 0 || !!session.workspace.operation || pwa.activating} onclick={applyUpdate}>{pwa.activating ? 'Updating…' : 'Update and reload'}</Button>{/if}
  {#if pwa.error}<p class="ui-error" role="alert">{pwa.error}</p>{/if}
</div>
