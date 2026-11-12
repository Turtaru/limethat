# Verification checklist

Use disposable archive copies. No automated tests or device checks have been run as part of the initial implementation. Type-check/build results are separate from runtime/device evidence.

## Prepared check sources

`checks/foundation.test.ts` covers metadata/ID preservation, date precision and invalid calendars, frames, stale-save refusal, verified BOM/CRLF backups, failed backup verification, external changes during backup, partial label changes, unreadable events, nonempty-folder refusal and mutation overlap. `checks/memory-folder.ts` is an in-memory filesystem double, not evidence of browser/provider behavior. `checks/icons.test.ts` covers manifest subpath resolution, PNG dimensions, the ICO directory and maskable glyph safe zone; it is prepared but has not been run.

`checks/image-frame.test.ts` adds pure contain/cover, resize, pinch/pan, fit/zoom and Android Float-boundary cases plus event/label frame-only serialization. See [the component spike checklist](image-framing.md) for physical-touch, lifecycle and sequential Android round-trip validation. Geometry sources are not proof of actual pointer behavior.

Request permission before running `npm test`. `npm run check` and `npm run build` do not execute these checks.

## Emulator first

1. Run `npm run dev` and note the actual port (Vite can choose another port if 5173 is occupied).
2. With the appropriate emulator serial:

   ```sh
   adb -s emulator-5554 reverse tcp:5173 tcp:5173
   ```

3. Open `http://localhost:5173/limethat/` in emulator Chrome. Loopback is a secure context; no Wi-Fi CA setup is needed.
4. Put a disposable archive **inside the emulator**. A Mac folder alone does not exercise Android folder access.
5. Use the application connection controls and Settings, then review the events/labels screens and editors. No `window.limethat` global is mounted. See [UI integration](ui-integration.md) for the application review checklist.

The prototype established localhost/adb access, not full round trips or persistent permissions. Physical-phone Wi-Fi connectivity was unresolved; do not change certificate trust handling to work around that network problem. `adb` is optional verification tooling, not installed or configured by this repository.

## Folder and storage behavior

- [ ] Capability detection reports unsupported and insecure contexts honestly, without a storage-mirror fallback.
- [ ] Open a version-1 Android archive; inspect titles, dates, embedded labels and warnings.
- [ ] Create in an empty folder; inspect manifest, tags and both directories.
- [ ] Reject a nonempty folder with no existing files overwritten.
- [ ] Cancel selection with an active archive; confirm it remains usable.
- [ ] Select an invalid replacement; confirm the previous archive and summary remain intact.
- [ ] Restore a remembered handle without prompting; explicitly reconnect if permission is required.
- [ ] Restart browser/device; check remembered handle and real permission behavior.
- [ ] Revoke access or move/remove the folder; check actionable recovery and reselection.
- [ ] Verify IndexedDB holds only a folder handle; Cache Storage holds no archive data.
- [ ] Create/update/delete an event; confirm UUID/created are stable and backup contents match original bytes.
- [ ] Edit from another app, then attempt a stale save; confirm conflict refusal.
- [ ] Rename/delete a label, including a large integer ID; inspect every embedded event reference and unknown properties.
- [ ] Add an unreadable event; confirm reference-changing label operations refuse to proceed.
- [ ] Interrupt or deny a multi-file write; inspect affected/recovery paths and partial on-disk changes.
- [ ] Cause a refresh failure after a completed write; confirm the outcome says saved, not retry-save.
- [ ] Attempt overlapping mutations; confirm `busy` rather than dropped or interleaved writes.
- [ ] Round-trip changed archives with Android, **without concurrent editing**.

## Pictures

- [ ] Import rotated EXIF and transparent images; verify orientation, white background, dimensions and both verified JPEGs.
- [ ] Check no upscaling; whole-image thumbnail width at most 1080; original EXIF not copied.
- [ ] Reject inputs over 25 MiB; verify invalid/unsupported images produce a failure rather than a success.
- [ ] Measure decode/encode memory and responsiveness with large images on target hardware before deciding about workers.
- [ ] Compare frame bounds, viewport resize and anchor zoom against Android.
- [ ] Change frames only; verify attachment bytes do not change.
- [ ] Open an archive without reading all attachments; request pictures/thumbnail fallback only when needed.
- [ ] Cancel a draft, remove references and delete an event; confirm attachments remain.

## Static deployment and later views/offline

- [ ] Enable Actions-based Pages and verify the `/limethat/` application/assets over trusted HTTPS.
- [ ] Inspect manifest scope/start URL and every icon URL on `/limethat/`; confirm no request falls back to the hostname root.
- [ ] Check SVG favicon and ICO fallback in browser tabs; check Safari's pinned-tab mask where supported.
- [ ] Add to the iOS/iPadOS Home Screen; verify the opaque Apple icon and platform-applied corners.
- [ ] Install/add to Home Screen on Android and desktop where supported; verify regular/maskable icons and that launch stays under `/limethat/`.
- [ ] Preview maskable icons with circular, rounded-square and squircle masks; confirm the white lime glyph is not clipped.
- [ ] On physical Android Chrome, verify actual picker support, writes, prompts and restart behavior. Desktop build success is not device evidence.
- [ ] Verify hash deep links, unknown routes/IDs, reconnect/resume, draft preservation during Back/Forward, focus and scroll restoration.
- [ ] Verify complete precache readiness, intentional update activation, multi-tab update refusal and preservation of drafts.
- [ ] After readiness, disconnect and open **every** route, including never-visited lazy views; read/edit local archives and display local pictures without network requests.
- [ ] Offline relaunch still requires an available folder and usable permission; validate cache eviction/reconnection messaging.

Icon/install metadata and generated app-shell caching are implemented, but installation and offline relaunch on target devices remain unverified. No background archive access or continuous watching is provided.
