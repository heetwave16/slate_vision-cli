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

/* ------------------------------------------------------------------ */
/* Pure Client-Side ZIP Archive Generation for VFS                    */
/* ------------------------------------------------------------------ */

const makeCrcTable = () => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
};

const CRC_TABLE = makeCrcTable();

export function calculateCrc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function writeUint16LE(arr: Uint8Array, offset: number, val: number) {
  arr[offset] = val & 0xFF;
  arr[offset + 1] = (val >>> 8) & 0xFF;
}

function writeUint32LE(arr: Uint8Array, offset: number, val: number) {
  arr[offset] = val & 0xFF;
  arr[offset + 1] = (val >>> 8) & 0xFF;
  arr[offset + 2] = (val >>> 16) & 0xFF;
  arr[offset + 3] = (val >>> 24) & 0xFF;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function buildZipBlob(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const processed = entries.map(e => {
    const nameBytes = encoder.encode(e.name.replace(/\\/g, '/').replace(/^\//, ''));
    const crc = calculateCrc32(e.data);
    return {
      nameBytes,
      data: e.data,
      crc,
      size: e.data.length,
    };
  });

  // Calculate buffer sizes
  let totalLocalSize = 0;
  for (const p of processed) {
    totalLocalSize += 30 + p.nameBytes.length + p.size;
  }

  let totalCentralSize = 0;
  for (const p of processed) {
    totalCentralSize += 46 + p.nameBytes.length;
  }

  const totalZipSize = totalLocalSize + totalCentralSize + 22;
  const buffer = new Uint8Array(totalZipSize);

  let localOffset = 0;
  const centralOffsets: number[] = [];

  // 1. Write Local File Headers and Data
  for (const p of processed) {
    centralOffsets.push(localOffset);

    // Signature 0x04034b50
    writeUint32LE(buffer, localOffset, 0x04034b50);
    writeUint16LE(buffer, localOffset + 4, 10); // version needed
    writeUint16LE(buffer, localOffset + 6, 0x0800); // flags (UTF-8)
    writeUint16LE(buffer, localOffset + 8, 0); // method (store)
    writeUint16LE(buffer, localOffset + 10, 0); // time
    writeUint16LE(buffer, localOffset + 12, 0); // date
    writeUint32LE(buffer, localOffset + 14, p.crc);
    writeUint32LE(buffer, localOffset + 18, p.size); // compressed
    writeUint32LE(buffer, localOffset + 22, p.size); // uncompressed
    writeUint16LE(buffer, localOffset + 26, p.nameBytes.length);
    writeUint16LE(buffer, localOffset + 28, 0); // extra length

    buffer.set(p.nameBytes, localOffset + 30);
    buffer.set(p.data, localOffset + 30 + p.nameBytes.length);

    localOffset += 30 + p.nameBytes.length + p.size;
  }

  // 2. Write Central Directory Headers
  let centralOffset = localOffset;
  const centralDirStart = centralOffset;

  for (let i = 0; i < processed.length; i++) {
    const p = processed[i];
    const localStart = centralOffsets[i];

    // Signature 0x02014b50
    writeUint32LE(buffer, centralOffset, 0x02014b50);
    writeUint16LE(buffer, centralOffset + 4, 20); // version made by
    writeUint16LE(buffer, centralOffset + 6, 10); // version needed
    writeUint16LE(buffer, centralOffset + 8, 0x0800); // flags (UTF-8)
    writeUint16LE(buffer, centralOffset + 10, 0); // store
    writeUint16LE(buffer, centralOffset + 12, 0); // time
    writeUint16LE(buffer, centralOffset + 14, 0); // date
    writeUint32LE(buffer, centralOffset + 16, p.crc);
    writeUint32LE(buffer, centralOffset + 20, p.size);
    writeUint32LE(buffer, centralOffset + 24, p.size);
    writeUint16LE(buffer, centralOffset + 28, p.nameBytes.length);
    writeUint16LE(buffer, centralOffset + 30, 0); // extra len
    writeUint16LE(buffer, centralOffset + 32, 0); // comment len
    writeUint16LE(buffer, centralOffset + 34, 0); // disk start
    writeUint16LE(buffer, centralOffset + 36, 0); // internal attr
    writeUint32LE(buffer, centralOffset + 38, 0x81a40000); // external attr (regular file 0644)
    writeUint32LE(buffer, centralOffset + 42, localStart);

    buffer.set(p.nameBytes, centralOffset + 46);
    centralOffset += 46 + p.nameBytes.length;
  }

  // 3. Write End of Central Directory Record
  const eocdOffset = centralOffset;
  writeUint32LE(buffer, eocdOffset, 0x06054b50);
  writeUint16LE(buffer, eocdOffset + 4, 0); // disk number
  writeUint16LE(buffer, eocdOffset + 6, 0); // disk where cd starts
  writeUint16LE(buffer, eocdOffset + 8, processed.length); // entries on disk
  writeUint16LE(buffer, eocdOffset + 10, processed.length); // total entries
  writeUint32LE(buffer, eocdOffset + 12, totalCentralSize); // size of cd
  writeUint32LE(buffer, eocdOffset + 16, centralDirStart); // cd offset
  writeUint16LE(buffer, eocdOffset + 20, 0); // comment length

  return new Blob([buffer], { type: 'application/zip' });
}

export function exportVfsAsZip(env: EnvState): Blob {
  const entries: ZipEntry[] = [];
  const encoder = new TextEncoder();

  const walk = (node: any, curPath: string) => {
    if (node.phantom) return;
    if (node.type === 'file') {
      const content = node.content ?? '';
      entries.push({
        name: curPath,
        data: encoder.encode(content),
      });
    }
    if (node.children) {
      for (const child of node.children) {
        walk(child, curPath ? `${curPath}/${child.name}` : child.name);
      }
    }
  };

  walk(env.fs, 'slate-sandbox');
  return buildZipBlob(entries);
}

export function downloadVfsZip(env: EnvState, filename = 'slate-sandbox.zip') {
  if (typeof document === 'undefined') return;
  const blob = exportVfsAsZip(env);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

