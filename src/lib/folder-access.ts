import { ArchiveFailure, requireValue } from './errors';

export interface FolderCapability { supported: boolean; secureContext: boolean; message: string }

export function folderCapability(): FolderCapability {
  const secureContext = globalThis.isSecureContext === true;
  const supported = secureContext && typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
  return { supported, secureContext, message: supported ? 'Direct folder access is available.'
    : !secureContext ? 'Folder access requires HTTPS or localhost.'
    : 'This browser does not support direct read/write folder selection. Use a supported Chrome browser; no private archive copy is substituted.' };
}

/** Opens the browser picker immediately. Call directly from a user gesture, before unrelated asynchronous work. */
export function chooseFolder(): Promise<FileSystemDirectoryHandle> {
  const capability = folderCapability();
  requireValue(capability.supported, capability.message, 'unsupported');
  return window.showDirectoryPicker({ mode: 'readwrite', id: 'limethat-archive' });
}

export function folderPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
  return handle.queryPermission({ mode: 'readwrite' });
}

/** Prompts for a remembered handle's access. The caller must invoke this directly from a user gesture. */
export function requestFolderPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
  return handle.requestPermission({ mode: 'readwrite' });
}

async function database(): Promise<IDBDatabase> {
  requireValue(typeof indexedDB !== 'undefined', 'Folder handle persistence is unavailable', 'unsupported');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('limethat-workspace', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspace');
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new ArchiveFailure('unavailable', 'Close other Limethat tabs to open remembered workspace storage.'));
  });
}

async function storedHandle(mode: IDBTransactionMode, handle?: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('workspace', mode);
      const store = transaction.objectStore('workspace');
      const request = mode === 'readonly' ? store.get('folder') : store.put(handle, 'folder');
      let result: FileSystemDirectoryHandle | null = null;
      request.onsuccess = () => { if (mode === 'readonly') result = request.result ?? null; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? request.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Remembered workspace transaction aborted'));
    });
  } finally { db.close(); }
}

export async function rememberFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  await storedHandle('readwrite', handle);
}

export async function restoreFolder(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await storedHandle('readonly');
  requireValue(handle === null || (handle.kind === 'directory' && typeof handle.queryPermission === 'function'), 'The remembered folder handle is invalid. Choose the folder again.');
  return handle;
}
