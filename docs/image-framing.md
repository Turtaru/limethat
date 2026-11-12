# Image framing component spike

This is non-destructive positioning, not pixel cropping. Components are reused in production event/label editor pages, but touch/device and archive round-trip validation are still pending. Cards/details use the read-only viewport to honor saved frames. Editors use `ImageFrameEditor` for existing and newly selected pictures; changes stay in the route draft until Save. No gesture libraries or automatic archive writes were added.

## Run the isolated harness

Build the isolated harness with `npm run build:framing` and serve `dist-framing/` with preview. Normal development now renders the real application, not the harness. Choose a local file; no folder permission is needed. The parent processes it through the existing orientation-aware JPEG pipeline and owns its object URL. New replacements get a contained, top-left frame expressed at a canonical 400px width. Rendering scales that metadata to the actual viewport.

The harness displays draft JSON and dirty state, supports Cancel, simulates a legacy missing frame, mirrors the draft in a narrower read-only viewport and can mount a second independently editable copy. Resize its width slider or the browser window. Whole-image viewing uses a native `<dialog>`; Escape and its Close button dismiss it. Image selection replaces the old URL only after the new processed image is ready; previous URLs are released after consumers update, and the current one on teardown.

For physical-device validation on static HTTPS, build **only the isolated image harness**:

```sh
npm run build:framing
npm run preview -- --outDir dist-framing
```

Publish `dist-framing/` to a separate, explicitly chosen HTTPS test location with the configured `/limethat/` base (or build with the appropriate `--base`). It contains no folder harness. This is an opt-in development artifact, not the normal Pages artifact: `npm run build` and the Pages workflow deploy the real application without either harness. The normal application build includes offline shell caching; the framing artifact does not register a service worker. Neither build establishes gesture validation.

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
- `ImageFrameEditor.svelte`: the same image/draft props, optional `src`, `editable` (default true), required `onchange`, optional `onopen` and `onselect(file)`. With `onselect`, an empty bordered 4:3 frame opens its native file input. Loaded images show only Fit width, Fit height and Change image. Drag/pinch/wheel and focused-frame arrow/+/- keys handle positioning and zoom. `busy`/`error` describe preparation without writing data. It never saves or cancels a draft itself.
- `image-frame.ts`: pure typed validation, contain/cover defaults, width-relative resizing, anchored zoom, centroid pinch/pan, native fit actions and display bounds.

Treat emitted values as immutable; store the emitted frame (or an equivalent clone) in the parent draft. Pointer baselines are private and do not follow normal parent acknowledgements. An external frame reset cancels an active gesture. Source replacement, permission to edit changing, loss of readiness, viewport resizing and component teardown also cancel captures. Merely rendering, loading, resizing, focusing or tapping without movement does not emit a frame or fill in missing metadata.

The parent owns URL/file lifetime, explicit replacement initialization, Save/Cancel and navigation. Changing `src` alone **does not reset the supplied frame**; the replacement workflow must supply a new `containedFrame(width)` along with the new attachment. Existing unframed images render centered cover but retain a missing frame until an actual change. Use the oriented **processed image**, not a thumbnail whose aspect ratio/source may change during a gesture.

## Geometry and inputs

Persisted fields remain `offsetX`, `offsetY`, `cropWidth`, `cropHeight`, `cropScale`. No device-pixel-ratio multiplication. Width changes derive proportional offsets and unchanged relative zoom without modifying the draft. Controls emit a coherent frame at the current CSS viewport width.

Fit width resets X only; fit height resets Y only, matching Android rather than the prototype. Reset is contained/top-left/scale 1. No product-level pan or zoom bounds exist. Validation rejects invalid ratios and nonfinite numbers, including overflow to Android Float infinity or positive sizes/scale that underflow to Float zero. Existing `PictureFrame` and the older `pictures.ts` geometry exports remain compatible aliases/re-exports; archive JSON conversion delegates to the same pure validator.

Pointer IDs/capture stay local to each viewport. Adding/removing a finger rebases against the last emitted composition. Pinching combines initial/current centroid translation with distance scaling. Near-coincident starting pointers wait for separation before establishing a usable baseline; there is no divide-by-zero zoom. Invalid numeric operations retain the last valid frame and report the reason.

Only a ready editable viewport uses `touch-action: none`; read-only previews leave page scrolling alone. A non-passive wheel listener is attached only in editable mode and consumes vertical wheel zoom at the cursor; Ctrl-wheel remains browser zoom. Keyboard shortcuts run only on the focused viewport, never in unrelated fields; browser Ctrl/Meta/Alt shortcuts are untouched. Native fit controls remain outside the localized keyboard application; focused-frame arrows and +/− provide non-gesture positioning/zoom. The empty frame's native file input and Change image button are keyboard-operable. Focus is visible; pointer moves are not sent to a live region. Rendering has no CSS/View Transitions during gestures. During pointer drag/pinch, a faded duplicate displays image overflow outside the crop while the original remains clipped and opaque inside the bordered frame. Release/cancel/resize removes the overflow preview; read-only views stay clipped.

Standard platform patterns: [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events), [pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture), [`touch-action`](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action), [ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver), and [native dialogs](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement).

## Archive integration

Read-only and interactive editor-page integration are implemented. `src/features/FramePicture.svelte` loads originals on demand or prepares selected Files using the existing orientation-aware pipeline. Generic UI editors accept a caller-owned picture-editor snippet, keeping archive access outside the library. Route drafts retain existing frame maps, per-File replacement frames and completed imports across Back/Forward. The existing archive API accepts these frames:

- Event Save: use `{ ...original.frames, [attachmentFilename]: draftFrame }` inside the complete event draft. Retain entries outside the visible picture list. Remove a frame only through an explicit parent action.
- Label Save: supply the existing picture path and optional `picture_frame` in the full label draft.
- Parent Cancel restores the initial optional frame; it never removes imported/shared attachments.
- New/replacement pictures preview a processed JPEG and start with a contained frame. The user can reposition before Save; each selected File retains its own frame. The media pipeline weakly caches completed processing by immutable Blob identity, so preview and import use the same JPEG/thumbnail without a second encode. Processing failures are not cached. Do not reuse the old picture's offsets.
- Save uses existing verified writes/backups/conflict checks. Framing does not call `processPicture`, re-encode JPEGs or write attachments. No autosave on input.

## Prepared checks and remaining proof

`checks/image-frame.test.ts` covers contain/cover shapes, immutable resize, combined pinch/pan and one-pointer rebasing math, anchor zoom, axis-preserving fits, Android Float boundaries, single-line metadata serialization and frame-only event/label writes that leave attachments unchanged. These are check **sources**, not executed evidence. Tests require user permission.

Manual checks (use disposable archive copies for the last group):

- [ ] Landscape, portrait and square images: contained replacements versus missing-frame cover; no dirty state on viewing, tapping or resize.
- [ ] Choose/change images through the frame; verify its 2px theme border. Check mouse/pen drag outside the viewport with capture, faded overflow during dragging and cleanup on release/cancel; keyboard arrows/+/-; wheel anchor and Ctrl-wheel browser zoom; Fit width/height.
- [ ] Physical Android: real two-finger pinch **with simultaneous pan**; finger add/remove/crossing; cancellation and lost capture; no jump back to one finger.
- [ ] Resize during a gesture, change image during a gesture, reset/cancel a draft, unmount the second editor and remount; check no stuck capture/listeners.
- [ ] Two editable instances stay independent; read-only preview matches at a narrower width and allows ordinary page scrolling.
- [ ] Keyboard-only and screen-reader control/focus behavior; no per-move announcements or shortcuts inside unrelated controls.
- [ ] Missing/damaged image URL gives an actionable noneditable fallback; unsupported image input retains the prior picture.
- [ ] Save event and label frames, inspect JSON, open sequentially in Android, edit there and reopen in the PWA. Compare composition at narrow/wide viewport widths.
- [ ] Verify original JPEG/thumbnail hashes after frame-only Save and Cancel; preserve hidden/shared frame entries and attachments.
- [ ] Confirm an external edit blocks a stale frame save through the archive layer.

Type/build checks are not proof of touch behavior. Interactive editor integration still needs the browser, physical-device, accessibility and Android round-trip checks above before device compatibility can be claimed.
