<script lang="ts">
  import { untrack } from 'svelte';
  import { Button, Field } from '../lib/ui-kit';
  import { useSession } from './session.svelte';

  const session = useSession();
  let report = $state('');
  let copyStatus = $state('');
  function currentReport(): string {
    const workspace = session.workspace;
    const details = workspace.diagnostics?.report(__APP_BUILD__) ?? `Build: ${__APP_BUILD__}\nOpen an archive to collect diagnostics.`;
    const progress = workspace.loadProgress;
    if (!progress) return details;
    return `${details}\n\nArchive phase: ${progress.phase}\nEvent files read: ${progress.read}/${progress.total}\nUnreadable events: ${progress.unreadable}\nFolder entries: ${progress.entries}\nLast progress elapsed: ${(progress.elapsedMs / 1000).toFixed(1)} s\nFolder listing: ${(progress.enumerationMs / 1000).toFixed(1)} s\nReading/parsing: ${(progress.readingMs / 1000).toFixed(1)} s\nSlowest batch: ${(progress.slowestBatchMs / 1000).toFixed(1)} s`;
  }
  $effect(() => {
    const diagnostics = session.workspace.diagnostics;
    const update = () => { report = currentReport(); };
    untrack(update);
    copyStatus = '';
    if (!diagnostics) return;
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  });
  async function copyReport() {
    const text = currentReport();
    try {
      await navigator.clipboard.writeText(text);
      copyStatus = 'Report copied.';
    } catch {
      copyStatus = 'Clipboard unavailable. Select and copy the report text below.';
    }
    session.activity.add(copyStatus, copyStatus === 'Report copied.' ? 'info' : 'warning');
  }
</script>
<div class="ui-stack">
  <Button onclick={copyReport}>Copy report</Button>
  {#if copyStatus}<p class="ui-muted" role="status">{copyStatus}</p>{/if}
  <Field label="Loading diagnostics report">{#snippet children(control)}<textarea id={control.id} class="ui-input" rows="16" readonly value={report}></textarea>{/snippet}</Field>
</div>
