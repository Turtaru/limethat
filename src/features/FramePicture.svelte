<script lang="ts">
  import { tick, untrack } from 'svelte';
  import ImageFrameEditor from '../lib/images/ImageFrameEditor.svelte';
  import type { PictureFrame } from '../lib/archive-format';
  import { useSession, type DraftPictures } from './session.svelte';

  let { name, file, alt, frame, pictures, disabled = false, onchange, onselect }: {
    name?: string; file?: File; alt: string; frame?: PictureFrame;
    pictures: DraftPictures; disabled?: boolean; onchange: (frame: PictureFrame) => void; onselect?: (file: File) => void;
  } = $props();
  const session = useSession();
  let url = $state('');
  let error = $state('');
  let loading = $state(false);
  $effect(() => {
    const selected = file;
    const attachment = name;
    session.workspace.archive;
    let active = true;
    let owned = '';
    url = ''; error = ''; loading = !!(selected || attachment);
    if (!selected && !attachment) return;
    untrack(() => {
      const load = selected ? pictures.prepare(selected).then(value => value.image)
        : attachment ? session.workspace.readPicture(attachment, false) : Promise.reject(new Error('No picture selected.'));
      void load.then(blob => {
        if (!active) return;
        owned = URL.createObjectURL(blob); url = owned;
      }).catch(cause => { if (active) error = cause instanceof Error ? cause.message : 'Could not prepare this picture.'; })
        .finally(() => { if (active) loading = false; });
    });
    return () => { active = false; if (owned) void tick().then(() => URL.revokeObjectURL(owned)); };
  });
</script>

<section class="ui-stack ui-detail-picture ui-picture-editor" aria-label={`Picture framing: ${alt}`}>
  <ImageFrameEditor src={url} {alt} {frame} editable={!disabled} busy={loading} {error} {onchange} {onselect} />
</section>
