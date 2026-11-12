<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from '../ui/Button.svelte';
  import EditorPage from '../ui/EditorPage.svelte';
  import Field from '../ui/Field.svelte';
  import type { DockAction, LabelEditorDraft } from '../types';
  let { draft = $bindable(), editing = false, hasPicture = false, disabled = false, preparing = false, pictureEditor, recovery, dock: renderDock, onsave, oncancel }: {
    draft: LabelEditorDraft; editing?: boolean; hasPicture?: boolean; disabled?: boolean; preparing?: boolean; pictureEditor?: Snippet<[boolean]>; recovery?: Snippet; dock?: Snippet<[DockAction]>;
    onsave: (draft: LabelEditorDraft) => Promise<void>; oncancel: () => void;
  } = $props();
  let picture = $state<HTMLInputElement>();
  let saving = $state(false);
  let error = $state('');
  let nameError = $state('');
  const formId = $props.id();
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (disabled || saving || preparing) return;
    nameError = draft.name.trim() ? '' : 'Enter a label name.';
    if (nameError) return;
    saving = true; error = '';
    try { await onsave({ ...draft, name: draft.name.trim() }); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Could not save this label.'; }
    finally { saving = false; }
  }
</script>
<EditorPage title={editing ? 'Manage label' : 'New label'} disabled={saving} {oncancel}>
  <form id={formId} class="ui-stack" onsubmit={save} aria-busy={saving || preparing}>
    {#if !pictureEditor}
    <Field label={hasPicture ? 'Replace picture' : 'Add picture'} help={`Nonempty images up to 25 MB.${draft.picture ? ` Selected: ${draft.picture.name}.` : ''}`}>{#snippet children(control)}<input class="ui-input" id={control.id} type="file" accept="image/*" bind:this={picture} disabled={saving} onchange={() => { draft.picture = picture?.files?.[0] ?? null; }} aria-describedby={control.describedby}>{/snippet}</Field>
    {#if hasPicture}<label class="ui-checkbox"><input type="checkbox" bind:checked={draft.removePicture} disabled={saving}>Remove current picture</label>{/if}
    {/if}
    {#if pictureEditor}{@render pictureEditor(saving || disabled)}{/if}
    <Field label="Label name" error={nameError}>{#snippet children(control)}<input class="ui-input" id={control.id} required bind:value={draft.name} disabled={saving} aria-describedby={control.describedby} aria-invalid={control.invalid}>{/snippet}</Field>
    {#if error}<p class="ui-error" role="alert">{error}</p>{/if}
    {#if disabled}<p class="ui-error">Resolve the archive status before saving. Your draft remains here.</p>{/if}
  </form>
  {#if recovery && disabled && !saving}{@render recovery()}{/if}
  {#snippet footer()}
    {#if renderDock}{@render renderDock({ label: saving ? 'Saving label…' : 'Save label', icon: 'save', type: 'submit', form: formId, disabled: saving || disabled || preparing })}
    {:else}<div class="ui-actions"><Button disabled={saving} onclick={oncancel}>Cancel</Button><Button variant="primary" type="submit" form={formId} disabled={saving || disabled || preparing}>{saving ? 'Saving…' : 'Save label'}</Button></div>{/if}
  {/snippet}
</EditorPage>
