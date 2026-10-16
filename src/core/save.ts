// IndexedDB persistence with a versioned schema + migration hook.
import { SAVE_VERSION, type SaveData, emptySave, defaultSettings } from './model';
import { tuning } from '../tuning';

const DB_NAME = 'sensory-town';
const STORE = 'kv';
const KEY = 'save';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

export async function loadRaw(): Promise<unknown | null> {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[save] load failed, trying localStorage', err);
    try {
      const s = localStorage.getItem(DB_NAME);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  }
}

export async function writeRaw(data: SaveData): Promise<void> {
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(structuredClone(data), KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[save] IndexedDB write failed, using localStorage', err);
    try {
      localStorage.setItem(DB_NAME, JSON.stringify(data));
    } catch {
      /* out of options */
    }
  }
}

/** Bring any older save up to SAVE_VERSION. Add a case per version bump. */
export function migrate(raw: any): SaveData {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.profiles)) {
    return emptySave(tuning.app.defaultProfileNames);
  }
  let data = raw as SaveData;
  // v0 → v1 example: ensure fields exist.
  if (!data.version || data.version < 1) {
    data.version = 1;
  }
  data.town ??= { houses: [], decorations: [] };
  data.town.houses ??= [];
  data.town.decorations ??= [];
  data.settings = { ...defaultSettings(), ...(data.settings ?? {}) };
  for (const p of data.profiles) {
    p.creations ??= [];
  }
  if (data.version > SAVE_VERSION) {
    console.warn('[save] save is from a newer build; loading as-is');
  }
  data.version = SAVE_VERSION;
  return data;
}

export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted?.();
      if (!already) await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
}
