(function () {
  'use strict';

  if (window.RootsEmbeddedAuth) return;

  const PARENT_ORIGIN = 'https://pgoutzeris-stack.github.io';
  const embedded = window.parent !== window;
  const clients = new Set();
  const facades = new WeakMap();
  const listeners = new Set();
  const memory = new Map();
  let accessToken = '';
  let authEpoch = 0;
  let expiresAt = 0;
  let user = null;

  const memoryStorage = {
    getItem(key) {
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      memory.set(key, String(value));
    },
    removeItem(key) {
      memory.delete(key);
    },
  };

  function decodeClaims(token) {
    try {
      const encoded = String(token || '').split('.')[1] || '';
      const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      return JSON.parse(atob(padded));
    } catch (_) {
      return {};
    }
  }

  function currentSession() {
    if (!accessToken || !user?.id) return null;
    const now = Math.floor(Date.now() / 1000);
    return {
      access_token: accessToken,
      refresh_token: '',
      token_type: 'bearer',
      expires_at: expiresAt || 0,
      expires_in: expiresAt ? Math.max(0, expiresAt - now) : 0,
      user: { ...user },
    };
  }

  function notify(event, session = currentSession()) {
    listeners.forEach((callback) => {
      queueMicrotask(() => {
        try {
          callback(event, session);
        } catch (_) {}
      });
    });
  }

  function updateRealtimeClients(token) {
    clients.forEach((client) => {
      try {
        const result = client.realtime?.setAuth?.(token || null);
        if (result?.catch) result.catch(() => {});
      } catch (_) {}
    });
  }

  function applyParentAccess(payload = {}) {
    const token = String(payload.accessToken || payload.access_token || payload.session?.access_token || '');
    const claims = decodeClaims(token);
    const incomingUserId = String(
      payload.userId || payload.user?.id || payload.session?.user?.id || claims.sub || ''
    );
    const incomingEpoch = Number(payload.authEpoch) || 0;
    if (!token || !incomingUserId) return null;
    if (authEpoch && incomingEpoch && incomingEpoch < authEpoch) return null;
    if (authEpoch && incomingEpoch === authEpoch && user?.id && user.id !== incomingUserId) return null;

    const previousToken = accessToken;
    const previousUserId = user?.id || '';
    accessToken = token;
    authEpoch = incomingEpoch || authEpoch;
    expiresAt = Number(payload.expiresAt || payload.expires_at || claims.exp) || 0;
    user = {
      id: incomingUserId,
      email: String(payload.email || payload.user?.email || payload.session?.user?.email || claims.email || ''),
      aud: String(claims.aud || 'authenticated'),
      role: String(claims.role || 'authenticated'),
      app_metadata: claims.app_metadata || {},
      user_metadata: claims.user_metadata || {},
    };
    updateRealtimeClients(accessToken);
    if (previousUserId && previousUserId !== incomingUserId) notify('SIGNED_OUT', null);
    notify(previousToken && previousUserId === incomingUserId ? 'TOKEN_REFRESHED' : 'SIGNED_IN');
    return currentSession();
  }

  function clear({ notifyListeners = true } = {}) {
    const hadSession = Boolean(accessToken || user);
    accessToken = '';
    authEpoch = 0;
    expiresAt = 0;
    user = null;
    memory.clear();
    updateRealtimeClients('');
    if (hadSession && notifyListeners) notify('SIGNED_OUT');
  }

  function registerClient(client) {
    if (!embedded || !client) return client;
    if (facades.has(client)) return facades.get(client);
    clients.add(client);

    const unavailable = async () => {
      window.dispatchEvent(new CustomEvent('roots-auth-reconnect'));
      return {
        data: { session: null, user: null },
        error: new Error('Die Anmeldung wird vom Intranet übernommen.'),
      };
    };
    const auth = {
      getSession: async () => ({
        data: { session: currentSession() },
        error: null,
      }),
      getUser: async () => {
        const session = currentSession();
        return {
          data: { user: session?.user || null },
          error: session ? null : new Error('Keine bestätigte Intranet-Sitzung'),
        };
      },
      setSession: async (session) => {
        const applied = applyParentAccess(session || {});
        return {
          data: { session: applied, user: applied?.user || null },
          error: applied ? null : new Error('Ungültige Intranet-Sitzung'),
        };
      },
      refreshSession: async () => {
        const session = currentSession();
        return {
          data: { session, user: session?.user || null },
          error: session ? null : new Error('Keine bestätigte Intranet-Sitzung'),
        };
      },
      onAuthStateChange(callback) {
        listeners.add(callback);
        queueMicrotask(() => {
          try {
            callback('INITIAL_SESSION', currentSession());
          } catch (_) {}
        });
        return {
          data: {
            subscription: {
              unsubscribe() {
                listeners.delete(callback);
              },
            },
          },
        };
      },
      signOut: async (options = {}) => {
        if (options?.scope !== 'local') {
          try {
            window.parent.postMessage({ type: 'roots-request-signout' }, PARENT_ORIGIN);
          } catch (_) {}
        }
        clear();
        return { error: null };
      },
      signInWithPassword: unavailable,
      signUp: unavailable,
      resend: unavailable,
      resetPasswordForEmail: unavailable,
      updateUser: unavailable,
    };

    const facade = new Proxy(client, {
      get(target, property) {
        if (property === 'auth') return auth;
        if (property === '__rootsEmbeddedAuthPatched') return true;
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, property, value) {
        return Reflect.set(target, property, value, target);
      },
    });
    facades.set(client, facade);
    updateRealtimeClients(accessToken);
    return facade;
  }

  const api = {
    VERSION: 'access-broker-v5-20260730',
    embedded,
    applyParentAccess,
    clear,
    getAccessToken: () => accessToken || null,
    getAuthEpoch: () => authEpoch,
    getSession: currentSession,
    registerClient,
  };
  window.RootsEmbeddedAuth = api;

  if (!embedded || !window.supabase?.createClient) return;

  const originalCreateClient = window.supabase.createClient.bind(window.supabase);
  window.supabase.createClient = function (url, key, options = {}) {
    const customAccessToken = options.accessToken;
    const client = originalCreateClient(url, key, {
      ...options,
      accessToken: async () => accessToken || (customAccessToken ? await customAccessToken() : null),
      auth: {
        ...(options.auth || {}),
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: memoryStorage,
      },
    });
    return registerClient(client);
  };
})();
