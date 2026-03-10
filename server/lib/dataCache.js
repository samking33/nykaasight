const CACHE_TTL_MS = 60 * 60 * 1000;

const store = new Map();

const scheduleExpiry = (datasetId) => {
  const entry = store.get(datasetId);
  if (!entry) return;

  if (entry.timer) {
    clearTimeout(entry.timer);
  }

  const timer = setTimeout(() => {
    const active = store.get(datasetId);
    if (active?.timer) {
      clearTimeout(active.timer);
    }
    store.delete(datasetId);
  }, CACHE_TTL_MS);

  store.set(datasetId, { rows: entry.rows, timer });
};

export const set = (datasetId, rows) => {
  const prev = store.get(datasetId);
  if (prev?.timer) clearTimeout(prev.timer);

  store.set(datasetId, { rows, timer: null });
  scheduleExpiry(datasetId);
};

export const get = (datasetId) => {
  const entry = store.get(datasetId);
  if (!entry) return null;

  scheduleExpiry(datasetId);
  return entry.rows;
};

export const del = (datasetId) => {
  const entry = store.get(datasetId);
  if (entry?.timer) clearTimeout(entry.timer);
  store.delete(datasetId);
};

export { del as delete };

export default {
  set,
  get,
  delete: del,
};
