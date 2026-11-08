# Limethat

Headless folder-archive foundation: Svelte 5, strict TypeScript and Vite. Production location is this repository; the Android app and folder prototype remain untouched.

**No actual application views yet.** Production renders a bare shell. Routing (`svelte-spa-router` 5), visual components, transitions and picture-editing widgets belong to the next phase. App icons and install-manifest metadata are configured. Offline support is deliberately deferred until the shell/assets are stable; there is currently no service worker or offline-ready claim.

## Development

Use Node 24 and npm. Lockfile is committed.

```sh
npm ci
npm run dev
npm run check
npm run build
npm run preview
```

Vite uses `/limethat/` for repository-path hosting. Development URL: `http://localhost:5173/limethat/`.

`npm run check` checks Svelte, TypeScript and check sources without executing tests. `npm test` runs the focused checks in `checks/`; **run only with user permission**. No tests run during build or deployment. Dependency audit currently reports two low-severity development-only advisories through the Svelte Vite plugin's `deepmerge` dependency, with no published fix; production dependencies have no reported advisories.

Development alone includes an unstyled folder lifecycle harness. Its buttons invoke pickers/permission requests directly from user gestures. It exposes `window.limethat` for inspecting the headless API. Neither the harness nor that global is present in the production build. Use disposable archive copies.

```js
const workspace = window.limethat;
const event = workspace.summary.events[0];
const outcome = await workspace.updateEvent(event, {
  title: 'Changed title', body: event.body,
  startDate: event.startDate, endDate: event.endDate,
  tags: event.tags, frames: event.frames,
});
```

Forms must supply complete drafts, including existing tags/frames; a label draft supplies its complete title/picture/frame state. Omitted label pictures/frames are removed. Preserve unknown embedded tag/frame properties when editing their known fields. Operations retain unknown top-level event metadata and label properties independently of the form.

## API boundary

- `src/lib/archive-format.ts`: typed format models, preservation-aware event edits, date/frame validation and lossless JSON IDs.
- `src/lib/archive.ts`: `Archive(handle)` with `initialize`, `load`, `refresh`, `createEvent`, `updateEvent`, `deleteEvent`, `createLabel`, `updateLabel`, `deleteLabel`, `importPicture` and deferred `readPicture`.
- `src/lib/folder-access.ts`: capability/secure-context reporting, immediate picker/permission calls, and IndexedDB storage of **one handle only**.
- `src/lib/pictures.ts`: orientation-aware JPEG processing plus frame resizing, zoom and display bounds. No widgets, object URLs or attachment deletion.
- `src/lib/workspace.svelte.ts`: instantiate `Workspace` for a reactive session. It owns permission/operation state and the last successfully loaded archive, not unsaved drafts.

`workspace.choose()` opens an archive; `choose(true)` initializes an empty folder; `restore()` retrieves the remembered handle without prompting; `reconnect()` requests permission. Call `choose` and `reconnect` directly from a click or equivalent gesture, without awaiting anything first. Cancellation leaves the workspace intact. Failed replacement loads retain the previous archive and summary. A pending permission-required replacement must be reconnected or replaced by another successful open before mutations.

Workspace mutations return a discriminated outcome:

- `status: 'saved', refresh: 'ready'`: writes were read back and the summary refreshed.
- `status: 'saved', refresh: 'failed'`: writes **completed**; keep `result`, display `refreshError`, and refresh/reconnect. Do not retry the mutation blindly.
- `status: 'failed'`: inspect the structured error, affected paths and verified recovery paths. Partial changes can already exist.

Overlapping operations reject with `busy` (including lifecycle calls). Archive operations can also be used directly: they return `{ value, affectedPaths, recoveryPaths }` and do not refresh automatically. Label operations take the loaded summary as their conflict snapshot; use a new summary after each mutation. Label IDs are compared with `labelKey`, never `Number(id)`.

Errors carry `code`, `message`, `affectedPaths` and `recoveryPaths`. Backups are retained, not automatically restored or deleted. Storage never prompts for permission, renders messages or navigates. Progress reports actual decoding/encoding/writing stages, not percentages. Views own `URL.createObjectURL()` / `URL.revokeObjectURL()` lifetimes.

See [archive compatibility](docs/archive-compatibility.md) and [manual verification](docs/manual-verification.md).

## App logo and icons

The original round and square SVGs are copied into `public/icons/logo.svg` and `public/icons/logo-square.svg`; the originals in `godenk` remain untouched. The local round copy removes a reference to a nonexistent stroke gradient without changing the artwork.

- Round logo: scalable SVG favicon, multi-size ICO fallback (16/32/48), regular 192/512 PNG app icons.
- Square logo: opaque 180px Apple touch icon and separate full-bleed 192/512 maskable icons. The lime glyph fits inside the central 80%-diameter safe circle; platforms supply their own corner/circle masks.
- Monochrome lime glyph: Safari pinned-tab mask.
- `public/manifest.webmanifest`: app name, standalone display, theme/background colors and icon purposes. Relative manifest URLs keep scope/start URL/icons on the deployed repository path. HTML links use Vite's `%BASE_URL%`.

Keep generated files in version control; Vite copies them into `dist/`. After editing either local source SVG, regenerate them:

```sh
npm run icons:generate
```

`sharp` is development-only; rasterization does not run in the browser. No global tool or access to the original `godenk` paths is needed to regenerate. Future logo images in views can use `${import.meta.env.BASE_URL}icons/logo.svg`.

This follows the standard [web app manifest icons](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons) and [maskable icon](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons#purpose) patterns. Install availability still depends on the browser, HTTPS and its criteria; icon setup does not provide offline caching.

## Deployment and later PWA work

Enable GitHub Pages with the GitHub Actions source. `.github/workflows/pages.yml` builds/type-checks and uploads **only `dist/`**, then deploys the bare shell on pushes to `main` or manual dispatch. For another repository name, change Vite's `base`.

Future routes use `svelte-spa-router` hash URLs; no route pages or custom router are implemented. Manifest start URL/scope already resolve relative to the base-aware manifest link; future service-worker registration must also use Vite's base URL. Generate complete precaching from the build output, including every lazy chunk; do not cache archive data or external media. Report offline readiness only after complete caching. Keep service workers out of development and require an intentional update/activation decision that preserves drafts.

Folder handles and permission belong to the origin, not a project path. Another GitHub Pages project on the same hostname shares that security origin. Keep the origin stable; changing domains requires reconnecting. A PWA install will not grant filesystem permission or guarantee offline access to a moved/unavailable folder.

## Platform patterns

Use the browser APIs directly rather than adding a storage mirror:

- [File System API / File System Access](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
- [`showDirectoryPicker()` and transient user activation](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)
- [`requestPermission()`](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/requestPermission)
- [`createImageBitmap()` orientation](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap)
- [Canvas `toBlob()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)

The folder is the source of truth. No accounts, application server, uploads, private archive mirror, background synchronization or cross-device merging.
