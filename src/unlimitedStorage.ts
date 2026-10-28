import { invoke, isTauri } from "@tauri-apps/api/core";
import { hasCredentials } from "../shared/privacy";

const IDB_NAME = "ack-deck.unlimited-kv.v1";
const IDB_STORE = "kv";

export function isManagedStorageKey(key: string): boolean {
  return key.startsWith("ack-deck.") || key.startsWith("kontrol-merkezi.");
}

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readAllIdb(db: IDBDatabase | null): Promise<Record<string, string>> {
  if (!db) return {};
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const out: Record<string, string> = {};
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          if (typeof cursor.key === "string" && typeof cursor.value === "string" && isManagedStorageKey(cursor.key)) {
            out[cursor.key] = cursor.value;
          }
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      cursorReq.onerror = () => resolve({});
    } catch {
      resolve({});
    }
  });
}

function writeIdbEntry(db: IDBDatabase | null, key: string, value: string | null): void {
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    if (value === null) store.delete(key);
    else store.put(value, key);
  } catch {
    // Native disk store remains authoritative fallback.
  }
}

function clearIdbEntries(db: IDBDatabase | null): void {
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).clear();
  } catch {}
}

export function createUnlimitedStorageProxy(
  rawStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> & Partial<Pick<Storage, "clear" | "key" | "length">>,
  initialEntries: Record<string, string> = {},
  onChange?: (key: string | null, value: string | null, snapshot: Record<string, string>) => void,
): Storage {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(initialEntries)) {
    if (isManagedStorageKey(k) && typeof v === "string") {
      map.set(k, v);
    }
  }

  const snapshotObj = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of map.entries()) {
      if (!v.includes("AIza") && !hasCredentials(v)) {
        out[k] = v;
      }
    }
    return out;
  };

  const proxy: Storage = {
    get length(): number {
      return map.size;
    },
    key(index: number): string | null {
      if (index < 0 || index >= map.size) return null;
      return Array.from(map.keys())[index] ?? null;
    },
    getItem(key: string): string | null {
      const k = String(key);
      if (isManagedStorageKey(k)) {
        if (map.has(k)) return map.get(k)!;
        const legacy = rawStorage.getItem(k);
        if (legacy !== null) {
          map.set(k, legacy);
          return legacy;
        }
        return null;
      }
      return rawStorage.getItem(k);
    },
    setItem(key: string, value: string): void {
      const k = String(key);
      const str = String(value);
      if (!isManagedStorageKey(k)) {
        try {
          rawStorage.setItem(k, str);
        } catch {}
        return;
      }
      map.set(k, str);
      // Best-effort mirror for compact keys; never fail or throw on browser localStorage 5MB quota.
      if (str.length < 512_000) {
        try {
          rawStorage.setItem(k, str);
        } catch {
          try {
            rawStorage.removeItem(k);
          } catch {}
        }
      } else {
        try {
          rawStorage.removeItem(k);
        } catch {}
      }
      onChange?.(k, str, snapshotObj());
    },
    removeItem(key: string): void {
      const k = String(key);
      if (isManagedStorageKey(k)) {
        map.delete(k);
        try {
          rawStorage.removeItem(k);
        } catch {}
        onChange?.(k, null, snapshotObj());
        return;
      }
      try {
        rawStorage.removeItem(k);
      } catch {}
    },
    clear(): void {
      map.clear();
      try {
        rawStorage.clear?.();
      } catch {}
      onChange?.(null, null, {});
    },
  };

  return proxy;
}

let initialized = false;

export async function initUnlimitedStorage(): Promise<void> {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const rawStorage = window.localStorage;
  const initial: Record<string, string> = {};

  // 1. Migrate any existing keys currently in native browser localStorage
  try {
    for (let i = 0; i < rawStorage.length; i++) {
      const k = rawStorage.key(i);
      if (k && isManagedStorageKey(k)) {
        const v = rawStorage.getItem(k);
        if (v !== null) initial[k] = v;
      }
    }
  } catch {}

  // 2. Hydrate from IndexedDB (unlimited browser database)
  const db = await openIdb();
  const idbEntries = await readAllIdb(db);
  for (const [k, v] of Object.entries(idbEntries)) {
    initial[k] = v;
  }

  // 3. Hydrate from Tauri native atomic disk file (authoritative across WebView resets)
  const tauri = isTauri();
  let hadNativeStore = false;
  if (tauri) {
    try {
      const rawDisk = await invoke<string | null>("load_unlimited_store");
      if (rawDisk) {
        const parsed = JSON.parse(rawDisk) as Record<string, unknown>;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          hadNativeStore = true;
          for (const [k, v] of Object.entries(parsed)) {
            if (isManagedStorageKey(k) && typeof v === "string") {
              initial[k] = v;
            }
          }
        }
      }
    } catch {}
  }

  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let latestSnapshot: Record<string, string> | null = null;

  const flushToDisk = () => {
    if (!tauri || !latestSnapshot) return;
    const payload = JSON.stringify(latestSnapshot);
    latestSnapshot = null;
    void invoke("save_unlimited_store", { content: payload }).catch(() => {});
  };

  const proxy = createUnlimitedStorageProxy(rawStorage, initial, (key, value, snapshot) => {
    if (key === null) clearIdbEntries(db);
    else writeIdbEntry(db, key, value);

    if (tauri) {
      latestSnapshot = snapshot;
      if (flushTimer !== null) clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushToDisk();
      }, 200);
    }
  });

  try {
    Object.defineProperty(window, "localStorage", {
      value: proxy,
      configurable: true,
      enumerable: true,
    });
  } catch {
    // Fallback if environment disallows redefining window.localStorage
  }

  // Seed IndexedDB and native disk store if we migrated initial localStorage entries
  if (Object.keys(initial).length > 0) {
    for (const [k, v] of Object.entries(initial)) {
      if (!(k in idbEntries)) writeIdbEntry(db, k, v);
    }
    if (tauri && !hadNativeStore) {
      const cleanInit: Record<string, string> = {};
      for (const [k, v] of Object.entries(initial)) {
        if (!v.includes("AIza") && !hasCredentials(v)) cleanInit[k] = v;
      }
      void invoke("save_unlimited_store", { content: JSON.stringify(cleanInit) }).catch(() => {});
    }
  }

  window.addEventListener("pagehide", flushToDisk);
  window.addEventListener("beforeunload", flushToDisk);
}
