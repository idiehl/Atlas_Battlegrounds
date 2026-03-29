window.createAtlasAccountController = function createAtlasAccountController() {
  const listeners = new Set();
  const state = {
    ready: false,
    loading: false,
    session: null,
    savedItems: [],
    pendingKeys: new Set(),
    error: ""
  };

  let bootstrapRequest = null;

  function buildPendingKey(itemType, itemKey) {
    return `${itemType}:${itemKey}`;
  }

  function normalizeItemType(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeItemKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function createSnapshot() {
    return {
      ready: state.ready,
      loading: state.loading,
      session: state.session,
      savedItems: [...state.savedItems],
      pendingKeys: new Set(state.pendingKeys),
      error: state.error
    };
  }

  function notify() {
    const snapshot = createSnapshot();
    listeners.forEach((listener) => listener(snapshot));
  }

  async function api(path, { method = "GET", body } = {}) {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Account request failed.");
    }
    return payload;
  }

  async function bootstrap({ force = false } = {}) {
    if (bootstrapRequest && !force) {
      return bootstrapRequest;
    }

    state.loading = true;
    state.error = "";
    notify();

    bootstrapRequest = api("/api/library/bootstrap")
      .then((payload) => {
        state.ready = true;
        state.session = payload.session ?? null;
        state.savedItems = Array.isArray(payload.savedItems) ? payload.savedItems : [];
        state.error = "";
        return createSnapshot();
      })
      .catch((error) => {
        state.ready = true;
        state.session = null;
        state.savedItems = [];
        state.error = error instanceof Error ? error.message : "Account bootstrap failed.";
        return createSnapshot();
      })
      .finally(() => {
        state.loading = false;
        bootstrapRequest = null;
        notify();
      });

    return bootstrapRequest;
  }

  function isSaved(itemType, itemKey) {
    const normalizedType = normalizeItemType(itemType);
    const normalizedKey = normalizeItemKey(itemKey);
    return state.savedItems.some((item) => item.itemType === normalizedType && item.itemKey === normalizedKey);
  }

  function isPending(itemType, itemKey) {
    return state.pendingKeys.has(buildPendingKey(normalizeItemType(itemType), normalizeItemKey(itemKey)));
  }

  async function toggleSaved({ itemType, itemKey }) {
    const normalizedType = normalizeItemType(itemType);
    const normalizedKey = normalizeItemKey(itemKey);
    const pendingKey = buildPendingKey(normalizedType, normalizedKey);

    if (!state.session) {
      throw new Error("Log in to save items.");
    }

    if (!normalizedType || !normalizedKey || state.pendingKeys.has(pendingKey)) {
      return createSnapshot();
    }

    state.pendingKeys.add(pendingKey);
    state.error = "";
    notify();

    try {
      const method = isSaved(normalizedType, normalizedKey) ? "DELETE" : "POST";
      const payload = await api("/api/library/items", {
        method,
        body: {
          itemType: normalizedType,
          itemKey: normalizedKey
        }
      });

      state.ready = true;
      state.session = payload.session ?? state.session;
      state.savedItems = Array.isArray(payload.savedItems) ? payload.savedItems : state.savedItems;
      return createSnapshot();
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Save action failed.";
      throw error;
    } finally {
      state.pendingKeys.delete(pendingKey);
      notify();
    }
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    bootstrap,
    getState: createSnapshot,
    isPending,
    isSaved,
    subscribe,
    toggleSaved
  };
};
