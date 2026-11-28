export type ActivityLevel = 'info' | 'warning' | 'error';
export type ActivityEntry = {
  id: number; time: number; message: string; level: ActivityLevel;
  status: 'running' | 'complete' | 'failed' | 'resolved' | 'message';
};
export type ActivityIssue = { key: string; message: string; level: 'warning' | 'error'; href?: string };

/** Keeps this tab's operation history; progress updates replace state rather than producing log entries. */
export class SystemActivity {
  open = $state(false);
  entries = $state.raw<ActivityEntry[]>([]);
  issues = $state.raw<ActivityIssue[]>([]);
  private nextId = 0;
  private issueEntries = new Map<string, number>();

  add(message: string, level: ActivityLevel = 'info', status: ActivityEntry['status'] = 'message') {
    const id = ++this.nextId;
    this.entries = [...this.entries, { id, time: Date.now(), message, level, status }];
    return id;
  }

  finish(id: number, error?: string) {
    this.entries = this.entries.map(entry => entry.id === id
      ? { ...entry, status: error ? 'failed' : 'complete', level: error ? 'error' : entry.level, message: error ? `${entry.message}: ${error}` : entry.message }
      : entry);
  }

  syncIssues(issues: ActivityIssue[]) {
    for (const previous of this.issues) {
      if (!issues.some(issue => issue.key === previous.key)) {
        const id = this.issueEntries.get(previous.key);
        this.entries = this.entries.map(entry => entry.id === id ? { ...entry, status: 'resolved' } : entry);
        this.issueEntries.delete(previous.key);
      }
    }
    for (const issue of issues) {
      const id = this.issueEntries.get(issue.key);
      if (id === undefined) this.issueEntries.set(issue.key, this.add(issue.message, issue.level));
      else if (this.issues.some(previous => previous.key === issue.key && (previous.message !== issue.message || previous.level !== issue.level))) {
        this.entries = this.entries.map(entry => entry.id === id ? { ...entry, message: issue.message, level: issue.level } : entry);
      }
    }
    this.issues = issues;
  }
}

export function operationMessage(operation: string) {
  const messages: Record<string, string> = {
    opening: 'Opening archive', creating: 'Creating archive', restoring: 'Restoring archive',
    reconnecting: 'Reconnecting archive', closing: 'Closing archive', refreshing: 'Refreshing archive',
    saving: 'Saving changes', deleting: 'Deleting record', decoding: 'Preparing picture',
    'encoding-image': 'Preparing picture', 'encoding-thumbnail': 'Preparing thumbnail', writing: 'Writing picture',
    'creating thumbnails': 'Creating missing thumbnails', 'clearing event cache': 'Clearing event cache',
    'clearing picture cache': 'Clearing picture cache', 'translating related events': 'Converting related events',
    'rolling back migration': 'Rolling back migration',
  };
  return messages[operation] ?? operation;
}

export function activityProgress(operation: string | null, load: { phase: string; read: number; total: number } | null, thumbnails: { processed: number; total: number } | null) {
  if (operation === 'creating thumbnails' && thumbnails && thumbnails.total > 0) {
    return { value: thumbnails.processed, total: thumbnails.total, message: `Processing pictures · ${thumbnails.processed} of ${thumbnails.total}` };
  }
  if (['opening', 'restoring', 'reconnecting'].includes(operation ?? '') && load && ['reading', 'complete'].includes(load.phase) && load.total > 0) {
    return { value: load.read, total: load.total, message: `Checking events · ${load.read} of ${load.total}` };
  }
  return null;
}
