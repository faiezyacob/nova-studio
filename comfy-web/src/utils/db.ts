const DB_NAME = 'nova-studio';
const STORE_NAME = 'app-store';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const db = {
  async get<T>(key: string): Promise<T | undefined> {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async set(key: string, value: unknown): Promise<void> {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async remove(key: string): Promise<void> {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
};

const LOCAL_STORAGE_KEYS = [
  "image_dimensions", "loaded_model", "chat_sessions",
  "agent_sessions", "app_mode", "comfyui_gallery",
  "video_gallery", "video_workspace_state",
];

let migrationDone = false;

export async function migrateFromLocalStorage() {
  if (migrationDone) return;
  migrationDone = true;
  for (const key of LOCAL_STORAGE_KEYS) {
    try {
      const val = localStorage.getItem(key);
      if (val !== null) {
        const existing = await db.get(key);
        if (existing === undefined) {
          await db.set(key, JSON.parse(val));
        }
      }
    } catch {
      // ignore parse errors for individual keys
    }
  }
}
