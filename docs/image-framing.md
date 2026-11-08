# Image framing component spike

This is non-destructive positioning, not pixel cropping. Components are reusable production source, but touch/device and archive round-trip validation are still pending. No page designs, gesture libraries or automatic archive writes were added.

## Run the isolated harness

`npm run dev` includes an unstyled image harness below the folder harness. Choose a local file; no folder permission is needed. The parent processes it through the existing orientation-aware JPEG pipeline and owns its object URL. New replacements get a contained, top-left frame expressed at a canonical 400px width. Rendering scales that metadata to the actual viewport.

The harness displays draft JSON and dirty state, supports Cancel, simulates a legacy missing frame, mirrors the draft in a narrower read-only viewport and can mount a second independently editable copy. Resize its width slider or the browser window. Whole-image viewing uses a native `<dialog>`; Escape and its Close button dismiss it. Image selection replaces the old URL only after the new processed image is ready; previous URLs are released after consumers update, and the current one on teardown.

For physical-device validation on static HTTPS, build **only the isolated image harness**:

```sh
npm run build:framing
npm run preview -- --outDir dist-framing
```

Publish `dist-framing/` to a separate, explicitly chosen HTTPS test location with the configured `/limethat/` base (or build with the appropriate `--base`). It contains no folder harness. This is an opt-in development artifact, not the normal Pages artifact: `npm run build` and the Pages workflow still deploy the bare shell without either harness. There is no offline cache or gesture-validation claim in either build.

## Component contract

```svelte
<script lang="ts">
  import ImageFrameEditor from './lib/images/ImageFrameEditor.svelte';
  import type { ImageFrame } from './lib/images/image-frame';

  let { imageUrl, description }: { imageUrl: string; description: string } = $props();
  let draft = $state.raw<ImageFrame | null>(null);
</script>

<ImageFrameEditor
  src={imageUrl}
  alt={description}
  frame={draft}
  onchange={value => { draft = value; }}
/>
```

- `ImageFrameViewport.svelte`: `src`, `alt`, optional `frame`, `editable` (default false), `onchange`, `onopen`, and `onreadychange`. Read-only use needs only URL/description/frame; `onopen` adds a separate whole-image button. Editable use requires an `onchange` callback.
- `ImageFrameEditor.svelte`: the same image/draft props, `editable` (default true), required `onchange`, optional `onopen`. Adds native buttons for Reset, fit, directional movement and zoom. It never saves or cancels a draft itself.
- `image-frame.ts`: pure typed validation, contain/cover defaults, width-relative resizing, anchored zoom, centroid pinch/pan, native fit actions and display bounds.

Treat emitted values as immutable; store the emitted frame (or an equivalent clone) in the parent draft. Pointer baselines are private and do not follow normal parent acknowledgements. An external frame reset cancels an active gesture. Source replacement, permission to edit changing, loss of readiness, viewport resizing and component teardown also cancel captures. Merely rendering, loading, resizing, focusing or tapping without movement does not emit a frame or fill in missing metadata.

The parent owns URL/file lifetime, explicit replacement initialization, Save/Cancel and navigation. Changing `src` alone **does not reset the supplied frame**; the replacement workflow must supply a new `containedFrame(width)` along with the new attachment. Existing unframed images render centered cover but retain a missing frame until an actual change. Use the oriented **processed image**, not a thumbnail whose aspect ratio/source may change during a gesture.

## Geometry and inputs

Persisted fields remain `offsetX`, `offsetY`, `cropWidth`, `cropHeight`, `cropScale`. No device-pixel-ratio multiplication. Width changes derive proportional offsets and unchanged relative zoom without modifying the draft. Controls emit a coherent frame at the current CSS viewport width.

Fit width resets X only; fit height resets Y only, matching Android rather than the prototype. Reset is contained/top-left/scale 1. No product-level pan or zoom bounds exist. Validation rejects invalid ratios and nonfinite numbers, including overflow to Android Float infinity or positive sizes/scale that underflow to Float zero. Existing `PictureFrame` and the older `pictures.ts` geometry exports remain compatible aliases/re-exports; archive JSON conversion delegates to the same pure validator.

Pointer IDs/capture stay local to each viewport. Adding/removing a finger rebases against the last emitted composition. Pinching combines initial/current centroid translation with distance scaling. Near-coincident starting pointers wait for separation before establishing a usable baseline; there is no divide-by-zero zoom. Invalid numeric operations retain the last valid frame and report the reason.

Only a ready editable viewport uses `touch-action: none`; read-only previews leave page scrolling alone. A non-passive wheel listener is attached only in editable mode and consumes vertical wheel zoom at the cursor; Ctrl-wheel remains browser zoom. Keyboard shortcuts run only on the focused viewport, never in unrelated fields; browser Ctrl/Meta/Alt shortcuts are untouched. Native controls outside the localized keyboard application provide every framing action without gestures. Focus is visible; pointer moves are not sent to a live region. Rendering has no CSS/View Transitions during gestures.

Standard platform patterns: [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events), [pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture), [`touch-action`](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action), [ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver), and [native dialogs](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement).

## Later archive integration

Component-to-page/archive integration is deliberately deferred until gesture/round-trip validation. The existing archive API already accepts these frames:

- Event Save: use `{ ...original.frames, [attachmentFilename]: draftFrame }` inside the complete event draft. Retain entries outside the visible picture list. Remove a frame only through an explicit parent action.
- Label Save: supply the existing picture path and optional `picture_frame` in the full label draft.
- Parent Cancel restores the initial optional frame; it never removes imported/shared attachments.
- Picture replacement imports separately, then sets a new contained frame. Do not reuse the old offsets.
- Save uses existing verified writes/backups/conflict checks. Framing does not call `processPicture`, re-encode JPEGs or write attachments. No autosave on input.

## Prepared checks and remaining proof

`checks/image-frame.test.ts` covers contain/cover shapes, immutable resize, combined pinch/pan and one-pointer rebasing math, anchor zoom, axis-preserving fits, Android Float boundaries, single-line metadata serialization and frame-only event/label writes that leave attachments unchanged. These are check **sources**, not executed evidence. Tests require user permission.

Manual checks (use disposable archive copies for the last group):

- [ ] Landscape, portrait and square images: contained replacements versus missing-frame cover; no dirty state on viewing, tapping or resize.
- [ ] Mouse/pen drag outside the viewport with capture; keyboard arrows/+/-; wheel anchor and Ctrl-wheel browser zoom; button parity.
- [ ] Physical Android: real two-finger pinch **with simultaneous pan**; finger add/remove/crossing; cancellation and lost capture; no jump back to one finger.
- [ ] Resize during a gesture, change image during a gesture, reset/cancel a draft, unmount the second editor and remount; check no stuck capture/listeners.
- [ ] Two editable instances stay independent; read-only preview matches at a narrower width and allows ordinary page scrolling.
- [ ] Keyboard-only and screen-reader control/focus behavior; no per-move announcements or shortcuts inside unrelated controls.
- [ ] Missing/damaged image URL gives an actionable noneditable fallback; unsupported image input retains the prior picture.
- [ ] Save event and label frames, inspect JSON, open sequentially in Android, edit there and reopen in the PWA. Compare composition at narrow/wide viewport widths.
- [ ] Verify original JPEG/thumbnail hashes after frame-only Save and Cancel; preserve hidden/shared frame entries and attachments.
- [ ] Confirm an external edit blocks a stale frame save through the archive layer.

No browser, emulator, physical-device, accessibility-tool or Android round-trip interaction has been exercised by the implementation task. Type/build checks are not proof of touch behavior. Promote the spike only after the relevant manual/device evidence exists.
