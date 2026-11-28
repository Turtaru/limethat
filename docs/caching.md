# Cache and navigation ownership

The archive folder is authoritative. Browser caches and retained views must be disposable without changing archive files or write-conflict checks.

## Data

- `Workspace` owns the displayed `ArchiveSummary` and verification status. Cached and partial summaries remain read-only until folder verification completes.
- `EventSnapshotCache` persists event sources and file stamps by folder identity. It accelerates opening; it does not own the live summary.
- `PictureCache` owns persisted picture bytes, shared requests, the two-read queue, and metadata validation. Its ordinary validation interval is 30 seconds.
- The service worker caches only the deployed app shell, never archive data.

### Picture invalidation

`Archive.refresh()` invalidates pictures as well as rereading event data. Invalidation clears freshness and detaches pending work, then notifies mounted consumers. A generation guard prevents older requests from refilling storage or marking new data fresh. The read queue remains shared across generations.

Thumbnail creation notifies consumers of the affected picture. Clearing picture storage also invalidates the current archive's consumers. Other cache instances detect the storage-clear epoch on their next request.

`ArchivePicture` subscribes by filename and owns only its object URL and visibility. It unsubscribes and revokes URLs on cleanup. Retained list components therefore receive updates without remounting. View-transition files are temporary handoffs; completing a transition returns picture loading to `PictureCache`.

Invalidation forces metadata revalidation, not content hashing. Same-size/same-timestamp changes can still be missed. Existing thumbnails are not regenerated when an original changes.

## Saving

`Session` owns an in-memory queue of submitted event and label saves, including their picture imports. Navigation does not cancel a save. The submitted fields and picture frames are captured before enqueueing; filesystem jobs run one at a time through the existing verification and conflict checks.

Pending records cannot be edited again. Label renames also lock events using that label because their embedded tags are rewritten. Other records remain editable and their saves join the queue. Archive maintenance, deletion, switching folders, and app updates wait for the queue to finish.

Drafts remain in the session until the write succeeds. Failed jobs keep their drafts and show a recovery link across routes. A write that succeeds but fails its refresh is not offered for retry. Earlier successful label rewrites can rebase an existing event draft's source; external changes still fail source checks.

The queue is not persisted in IndexedDB. Keep the tab open until pending saves finish; the existing close/reload warning also covers queued drafts. IndexedDB snapshots remain disposable caches, not an outbox.

## Navigation

`Session.navigation` owns navigation memory for the current archive session:

- List and Settings positions are keyed by the full route URL, including search.
- Events and Labels tab destinations remember only their own directory routes.
- Detail entries remember their originating list independently of tab destinations.
- One `history.state.limethatNavigation` snapshot stores position, origin, and focus information for each history entry. An archive-session scope rejects snapshots left by another archive.

`App.svelte` performs restoration after rendering. Router restoration is disabled and browser [`history.scrollRestoration`](https://developer.mozilla.org/en-US/docs/Web/API/History/scrollRestoration) is `manual`, so only the app restores scroll. New detail visits start at the top; Back/Forward can restore that history entry's saved position. Focus restoration excludes inert views and uses `preventScroll`.

Only the Events and Labels directories retain DOM. Retained DOM is a rendering optimization, not a source of data or navigation truth. Switching archives resets navigation memory and remounts the retained directories.

## Verification

`checks/list-navigation.test.ts` covers tab/origin separation, per-entry history snapshots, archive isolation, and query replacement. Picture-cache and archive tests cover invalidation subscriptions and in-flight request isolation.

Browser checks should cover refreshing an unchanged picture filename, clearing picture storage, Events/Labels dock destinations, label-timeline returns, and Back/Forward scroll and focus with view transitions enabled and reduced motion enabled.
