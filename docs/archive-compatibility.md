# Version-1 archive contract

The Android implementation (`limethat-android`, especially `Moment.kt`, `Archive.kt`, `ImageFrame.kt` and `FramedImageView.kt`) defines compatibility. The sibling `limethat-folder-pwa` prototype supplied the browser format, recovery and image-processing behavior, not its DOM or global UI state.

## Layout and values

```text
manifest.json
tags.json
moments/<date>-<uuid>.md
attachments/<uuid>.jpg
attachments/<uuid>.jpg.thumb.jpg   # optional on existing archives
```

Both manifest and event `format_version` must be numeric 1. All text is strict UTF-8, at most 256 KiB per file, including writes. Unsupported/malformed data is rejected without rewriting it. Invalid event files remain visible in `unreadableEvents`; they are never silently excluded from a label rename/delete. Manifest counts/hashes remain untouched as the **original export record**, not current integrity checks.

Event Markdown starts with `---` front matter and a closing `---`. Each nonblank line is `key: <one JSON value>`; arbitrary YAML and duplicate keys are rejected. A `# Title` heading is required. The UUID and nonblank `created` timestamp are stable across edits. Dates are `null` (unknown), `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, validated as calendar dates without filling in missing precision. New event filenames use the local calendar date; creation timestamps are ISO instants.

Unknown metadata lines and pre-heading content are retained; editing normalizes line endings to LF. Backups preserve the exact loaded UTF-8 source, including BOM/CRLF. Unknown label properties and nested JSON numbers survive label changes. `lossless-json` avoids JavaScript numeric rounding, including Android signed-64-bit label IDs. Existing numeric versus string ID representations are retained; embedded event label IDs are strings. IDs are compared by their string keys without numeric coercion. New labels use the next numeric ID via `BigInt`, serialized as an exact JSON number within Android's signed-64-bit range. Allocating new IDs from nonnumeric IDs is refused.

Embedded event labels are objects containing string `id` and `title`. Renaming changes their title while retaining unknown properties; deleting removes their references. Picture-only label edits do not rewrite event references. Unknown event metadata is not regenerated from visible fields.

Local Markdown image references use `![alt](../attachments/<filename>)`. Label pictures use `attachments/<filename>`. Filenames are single safe components (`A-Za-z0-9._-`, excluding `.` and `..`); archive operations never follow arbitrary paths or fetch remote media. Other Markdown remains text. Thumbnails are optional on reads; a missing thumbnail falls back to the original. Attachments are read only on demand and limited to 25 MiB. No reference removal, event deletion or draft cancellation removes attachments.

## Legacy exports and related events

Opening an archive never migrates it. Displayed descriptions omit local image references and an empty `## Photos` section, while archive Markdown and editor source retain both. Sections containing other text remain visible.

Settings offers an explicit one-time conversion when nonempty `related_events` metadata exists and no completion timestamp exists. Each connected component (including indirect and one-way connections) receives one new numeric tag named `Related: <earliest dated event title>`, with a suffix for name collisions. Self-links are ignored. Missing targets, invalid relationships, unreadable events, or changed source files block conversion. Existing tags and original `related_events` metadata are preserved; this app neither creates nor updates relationships.

After writing and verifying tags and event references, the final write adds this app-specific metadata to `manifest.json`:

```json
"limethat_web": {
  "migrations": {
    "related_events_to_tags": {
      "completed_at": "2026-11-24T14:30:00.000Z"
    }
  }
}
```

Existing manifest fields, including original counts/hashes, are retained. The timestamp records completion, not a date cutoff or ongoing synchronization: later relationships added elsewhere are not translated. The Settings button disappears after completion. No per-relationship tracking or automatic migration retry is performed.

Migration and recovery require exclusive archive access: keep other tools closed until either finishes. Before any original is changed, verified backups and `limethat-related-events-recovery.json` record every target and backup path. A write failure automatically restores and verifies all originals, including the manifest, then removes the recovery record. Refresh before retrying migration. Backups remain available.

If rollback fails or the browser closes during migration, the recovery record remains. Opening the archive detects it before parsing potentially damaged originals, shows Settings recovery, and blocks other writes. **Roll back unfinished migration** validates all backup paths and contents before restoring any file, verifies restored bytes, and removes the record only after restoration succeeds. Recovery is repeatable if interrupted; reconnect if permission was lost. An empty record left before its first committed write can be removed safely because no original writes could have started. Recovery deliberately does not check for external edits: the exclusive-access assumption includes recovery.

## Frames and image bytes

Event frames are `image_frames: {"<filename>": {...}}`; labels use `picture_frame`. Values contain finite `offsetX`, `offsetY`, `cropWidth`, `cropHeight`, `cropScale`; dimensions and scale are positive and width/height is 4:3 (Android tolerance 0.01). Shared geometry validation also rejects values that overflow Android Float or positive dimensions/scale that underflow to Float zero; it does not impose product-level zoom/pan bounds.

Coordinates are Android **viewport pixels**, not normalized image coordinates. Resizing multiplies both offsets by `currentWidth / savedCropWidth`; relative `cropScale` remains unchanged. Rendering uses the contain scale multiplied by `cropScale`. An absent frame defaults to centered cover. Zoom keeps the image point under the chosen anchor fixed. Framing updates metadata only; processed picture bytes never change.

Imports decode with browser orientation handling, fit the whole image inside 2048×2048 without upscaling, fill transparency white, and encode JPEG at quality 0.9 without copying EXIF. Whole-image thumbnails are at most 1080 pixels wide and use quality 0.8. Both `<uuid>.jpg` and `<uuid>.jpg.thumb.jpg` are read back byte-for-byte after writing. Encoding differs from Android; supported inputs follow the browser, with **no HEIC guarantee**. Full-image decode memory on target devices remains unmeasured; no worker or memory-performance claim is made.

## Recovery and concurrency

Use archives sequentially with Android and other editors. Filesystem checks are **not a cross-app lock or atomic compare-and-swap**. Multiple simultaneous writers are unsupported.

Before destructive changes, all target sources are compared against their loaded snapshots. Verified sibling `<filename>.backup-<uuid>` copies are prepared before original files are changed. Each source is compared again immediately before its replacement/deletion. Every completed write is read back and compared byte-for-byte; deletion is checked for absence. Mutations within an Archive/Workspace reject overlap with `busy`.

Label renames/deletions preflight readable events and compare the current file set/sources against the supplied summary. All changed events and `tags.json` get recovery copies. Changes are **not atomic**: an event update can succeed before a later tags write fails. Errors identify possibly affected files and verified backups; inspect/refresh before resuming. No automatic rollback is attempted because another editor may have changed files meanwhile. A failed backup can itself remain incomplete; only verified backups appear in `recoveryPaths`.

Creating an archive first refuses any nonempty folder. Setup failures report that new directories/files may remain; never retry initialization in place without inspection. Failed picture imports likewise report possible partial attachments without deleting anything. A successful mutation followed by a failed refresh is reported as saved-with-refresh-failure, not a failed write.

IndexedDB contains only the remembered directory handle, never Markdown, labels, image bytes or an archive mirror. Restoring a handle does not imply permission survived. Picker/permission prompts require explicit user gestures. Browser restart, permission revocation and moved folders require reconnection or reselection.
