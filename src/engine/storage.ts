import type { EnvState } from './types';

const STORAGE_KEY = 'slate_sandbox_state_v2';
const STORAGE_META_KEY = 'slate_sandbox_meta_v2';

export interface StorageMetadata {
  lastSaved: number;
  version: string;
  bytes: number;
}

export function isStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const testKey = '__test_storage__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function savePersistentEnv(env: EnvState): boolean {
  if (!isStorageAvailable()) return false;
  try {
    const serialized = JSON.stringify(env);
    window.localStorage.setItem(STORAGE_KEY, serialized);
    const meta: StorageMetadata = {
      lastSaved: Date.now(),
      version: '2.0.0',
      bytes: serialized.length * 2, // rough UTF-16 bytes
    };
    window.localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
    return true;
  } catch (err) {
    console.warn('[Slate Storage] Failed to save persistent state:', err);
    return false;
  }
}

export function loadPersistentEnv(): EnvState | null {
  if (!isStorageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EnvState;
    if (parsed && parsed.fs && parsed.cwd && parsed.git && Array.isArray(parsed.history)) {
      return parsed;
    }
    return null;
  } catch (err) {
    console.warn('[Slate Storage] Failed to restore persistent state:', err);
    return null;
  }
}

export function clearPersistentStorage(): boolean {
  if (!isStorageAvailable()) return false;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(STORAGE_META_KEY);
    return true;
  } catch {
    return false;
  }
}

export function getStorageMetadata(): StorageMetadata | null {
  if (!isStorageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StorageMetadata;
  } catch {
    return null;
  }
}

export function exportStorageSnapshot(env: EnvState): string {
  const snapshot = {
    app: 'Slate',
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    env,
  };
  return JSON.stringify(snapshot, null, 2);
}

export function triggerDownload(filename: string, content: string, mimeType = 'application/json') {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importStorageSnapshot(jsonStr: string): EnvState {
  const parsed = JSON.parse(jsonStr);
  const env = parsed.env ?? parsed;
  if (!env.fs || !env.cwd || !env.git || !Array.isArray(env.history)) {
    throw new Error('Invalid Slate snapshot structure: missing essential virtual environment fields.');
  }
  return env as EnvState;
}
