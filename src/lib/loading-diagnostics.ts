export class LoadingDiagnostics {
  private samples = new Map<string, { count: number; total: number; max: number; unit: string }>();
  private counters = new Map<string, number>();

  record(name: string, value: number, unit = 'ms'): void {
    const sample = this.samples.get(name) ?? { count: 0, total: 0, max: 0, unit };
    sample.count++;
    sample.total += value;
    sample.max = Math.max(sample.max, value);
    this.samples.set(name, sample);
  }

  increment(name: string): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1);
  }

  async measure<T>(name: string, action: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try { return await action(); }
    finally { this.record(name, performance.now() - start); }
  }

  report(build: string): string {
    const lines = [`Build: ${build}`, 'Session aggregates; reset when opening another archive.', 'Timings include failed attempts. Parallel timings overlap; do not add them.', 'Image URL-to-load includes browser reading, scheduling, and decoding.', 'Only finished operations appear; failed/cancelled image loads and transition handoffs are excluded.', 'No filenames or contents collected.', ''];
    for (const [name, sample] of this.samples) {
      lines.push(`${name}: ${sample.count} samples, avg ${(sample.total / sample.count).toFixed(1)} ${sample.unit}, max ${sample.max.toFixed(1)} ${sample.unit}`);
    }
    for (const [name, count] of this.counters) lines.push(`${name}: ${count}`);
    if (!this.samples.size && !this.counters.size) lines.push('Waiting for file operations…');
    return lines.join('\n');
  }
}
