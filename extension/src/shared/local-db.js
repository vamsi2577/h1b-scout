// IndexedDB wrapper for locally-stored shard data.
// Works in both MV3 service workers and extension pages (same origin = same DB).
// Callers: background.js (importScripts) and panel.js (<script src="...">)

const LocalShardDB = (() => {
  const DB_NAME = "h1b-scout";
  const STORE = "local-shards";
  const VERSION = 1;

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = (event) => {
        event.target.result.createObjectStore(STORE);
      };
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => {
        dbPromise = null; // allow retry
        reject(event.target.error);
      };
    });
    return dbPromise;
  }

  async function get(letter) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(letter);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async function set(letter, data) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).put(data, letter);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function remove(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function clear() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function keys() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  return { get, set, remove, clear, keys };
})();
