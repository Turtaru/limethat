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
