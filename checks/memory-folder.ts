export class MemoryFolder {
  readonly kind = 'directory';
  readonly entries = new Map<string, MemoryFolder | MemoryFile>();
  readonly control: { fail?: string; corrupt?: string; afterWrite?: (path: string) => void };

  constructor(readonly name = '', private readonly prefix = '', control?: MemoryFolder['control']) {
    this.control = control ?? {};
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MemoryFolder> {
    let entry = this.entries.get(name);
    if (!entry && options?.create) {
      entry = new MemoryFolder(name, `${this.prefix}${name}/`, this.control);
      this.entries.set(name, entry);
    }
    if (!entry) throw new DOMException('Missing directory', 'NotFoundError');
    if (!(entry instanceof MemoryFolder)) throw new DOMException('Not a directory', 'TypeMismatchError');
    return entry;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MemoryFile> {
    let entry = this.entries.get(name);
    if (!entry && options?.create) {
      entry = new MemoryFile(name, `${this.prefix}${name}`, this.control);
      this.entries.set(name, entry);
    }
    if (!entry) throw new DOMException('Missing file', 'NotFoundError');
    if (!(entry instanceof MemoryFile)) throw new DOMException('Not a file', 'TypeMismatchError');
    return entry;
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.entries.delete(name)) throw new DOMException('Missing file', 'NotFoundError');
  }

  async *values() { yield* this.entries.values(); }
  handle(): FileSystemDirectoryHandle { return this as unknown as FileSystemDirectoryHandle; }

  async put(path: string, source: string): Promise<void> {
    const parts = path.split('/');
    const directory = parts.length === 2 ? await this.getDirectoryHandle(parts[0], { create: true }) : this;
    const file = await directory.getFileHandle(parts.at(-1)!, { create: true });
    file.data = new TextEncoder().encode(source);
  }

  async text(path: string): Promise<string> {
    const parts = path.split('/');
    const directory = parts.length === 2 ? await this.getDirectoryHandle(parts[0]) : this;
    const file = await directory.getFileHandle(parts.at(-1)!);
    return new TextDecoder('utf-8', { ignoreBOM: true }).decode(file.data);
  }
}

class MemoryFile {
  readonly kind = 'file';
  data: Uint8Array<ArrayBuffer> = new Uint8Array();
  constructor(readonly name: string, private readonly path: string, private readonly control: MemoryFolder['control']) {}
  async getFile(): Promise<File> { return new File([this.data], this.name); }
  async createWritable() {
    let pending = this.data;
    return {
      write: async (data: string | Blob) => {
        pending = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(await data.arrayBuffer());
      },
      close: async () => {
        if (this.control.fail === this.path) throw new DOMException('Simulated write failure', 'NotAllowedError');
        this.data = this.control.corrupt && this.path.includes(this.control.corrupt) ? new Uint8Array([0]) : pending;
        this.control.afterWrite?.(this.path);
      },
      abort: async () => {},
    };
  }
}
