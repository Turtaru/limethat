<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from '../ui/Button.svelte';
  import EditorPage from '../ui/EditorPage.svelte';
  import Field from '../ui/Field.svelte';
  import SelectedLabel from '../ui/SelectedLabel.svelte';
  import LabelPicker from './LabelPicker.svelte';
  import type { DockAction, EditorPicture, EventDraft, LabelOption } from '../types';

  let { draft = $bindable(), heading = 'New event', pictures = [], labels = [], maxPictureBytes = 25 * 1024 * 1024, disabled = false, preparing = false, pictureEditor, recovery, dock: renderDock, onsave, oncancel }: {
    draft: EventDraft; heading?: string; pictures?: EditorPicture[]; labels?: LabelOption[];
    maxPictureBytes?: number; disabled?: boolean; preparing?: boolean; pictureEditor?: Snippet<[boolean]>; recovery?: Snippet; dock?: Snippet<[DockAction]>;
    onsave: (draft: EventDraft) => Promise<void>; oncancel: () => void;
  } = $props();
  let picture = $state<HTMLInputElement>();
  let pickerOpen = $state(false);
  let saving = $state(false);
  let error = $state('');
  let errors = $state<Record<string, string>>({});
  const formId = $props.id();

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (saving || disabled || preparing) return;
    errors = {};
    error = '';
    if (!draft.title.trim() || /[\r\n]/.test(draft.title)) errors.title = 'Enter a title on one line.';
    for (const [key, value] of [['date', draft.date], ['endDate', draft.endDate]]) {
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors[key] = `Choose a full date (YYYY-MM-DD). Current value: ${value}.`;
    }
    if (Object.keys(errors).length) return;
    if (draft.pictures.some(file => !file.type.startsWith('image/') || file.size === 0 || file.size > maxPictureBytes)) {
      error = `Choose nonempty images up to ${Math.floor(maxPictureBytes / 1024 / 1024)} MB each. Browser decoding support varies; HEIC is not guaranteed.`;
      return;
    }
    saving = true;
    try {
      await onsave({ ...draft, title: draft.title.trim(), labelIds: [...draft.labelIds], pictures: [...draft.pictures], removedPictureIds: [...draft.removedPictureIds] });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not save this event.';
      if (cause && typeof cause === 'object' && 'fieldErrors' in cause) errors = cause.fieldErrors as Record<string, string>;
    }
    finally { saving = false; }
  }
</script>

<EditorPage title={heading} disabled={saving} {oncancel}>
  <form id={formId} class="ui-stack" onsubmit={save} aria-busy={saving || preparing}>
    {#if !pictureEditor}
    <Field label="Add pictures" help={`Images up to ${maxPictureBytes / 1024 / 1024} MB each.${draft.pictures.length ? ` Selected: ${draft.pictures.map(file => file.name).join(', ')}.` : ''}`} >
      {#snippet children(control)}<input bind:this={picture} class="ui-input" id={control.id} type="file" multiple accept="image/*" aria-describedby={control.describedby} disabled={saving} onchange={() => { draft.pictures = Array.from(picture?.files ?? []); }}>{/snippet}
    </Field>
    {#each pictures as item (item.id)}
      <label class="ui-checkbox"><input type="checkbox" checked={draft.removedPictureIds.includes(item.id)} disabled={saving} onchange={(event) => { draft.removedPictureIds = event.currentTarget.checked ? [...draft.removedPictureIds, item.id] : draft.removedPictureIds.filter(id => id !== item.id); }}>Remove {item.name}</label>
    {/each}
    {/if}
    {#if pictureEditor}{@render pictureEditor(saving || disabled)}{/if}
    <Field label="Title" error={errors.title}>
      {#snippet children(control)}<input class="ui-input" id={control.id} required bind:value={draft.title} aria-describedby={control.describedby} aria-invalid={control.invalid} disabled={saving}>{/snippet}
    </Field>
    <Field label="Start date" error={errors.date}>
      {#snippet children(control)}<input class="ui-input" id={control.id} type="date" min="0001-01-01" max="9999-12-31" bind:value={draft.date} aria-describedby={control.describedby} aria-invalid={control.invalid} disabled={saving}>{/snippet}
    </Field>
    <Field label="End date" error={errors.endDate}>
      {#snippet children(control)}<input class="ui-input" id={control.id} type="date" min="0001-01-01" max="9999-12-31" bind:value={draft.endDate} aria-describedby={control.describedby} aria-invalid={control.invalid} disabled={saving}>{/snippet}
    </Field>
    <Field label="Description">
      {#snippet children(control)}<textarea class="ui-input" id={control.id} bind:value={draft.description} disabled={saving}></textarea>{/snippet}
    </Field>
    <fieldset class="ui-stack ui-fieldset" disabled={saving}>
      <legend>Labels</legend>
      <div class="ui-cluster">
        {#each labels.filter(label => draft.labelIds.includes(label.id)) as label (label.id)}<SelectedLabel name={label.name} onremove={() => { draft.labelIds = draft.labelIds.filter(id => id !== label.id); }} />{/each}
      </div>
      <Button onclick={() => { pickerOpen = true; }}>Add labels</Button>
    </fieldset>
    {#if error}<p class="ui-error" role="alert">{error}</p>{/if}
    {#if disabled}<p class="ui-error">Saving is unavailable. Resolve the archive status before retrying. Your draft remains here.</p>{/if}
  </form>
  {#if recovery && disabled && !saving}{@render recovery()}{/if}
  {#snippet footer()}
    {#if renderDock}{@render renderDock({ label: saving ? 'Saving event…' : 'Save event', icon: 'save', type: 'submit', form: formId, disabled: saving || disabled || preparing })}
    {:else}<div class="ui-actions"><Button disabled={saving} onclick={oncancel}>Cancel</Button><Button type="submit" form={formId} variant="primary" disabled={saving || disabled || preparing}>{saving ? 'Saving…' : 'Save event'}</Button></div>{/if}
  {/snippet}
</EditorPage>
<LabelPicker bind:open={pickerOpen} {labels} bind:selected={draft.labelIds} dock={renderDock} />
