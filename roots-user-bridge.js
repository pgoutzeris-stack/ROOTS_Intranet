(function () {
  const ORIGIN = 'https://pgoutzeris-stack.github.io';
  const IN_IFRAME = window.parent !== window;
  const TOAST_MS = 9000;
  const visibleToastIds = new Set();
  const toastShownIds = new Set();

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function beepDataUri() {
    const sampleRate = 44100;
    const duration = 0.18;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, numSamples * 2, true);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const fade = Math.min(1, t * 40) * Math.min(1, (duration - t) * 40);
      const sample = Math.sin(2 * Math.PI * 880 * t) * 0.35 * fade;
      view.setInt16(44 + i * 2, sample * 32767, true);
    }
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return 'data:audio/wav;base64,' + btoa(binary);
  }

  let _beep = null;
  let _audioUnlocked = false;

  function unlockBridgeAudio() {
    if (_audioUnlocked) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        if (!_beep) {
          _beep = new Audio(beepDataUri());
          _beep.volume = 0.45;
        }
        _beep.currentTime = 0;
        _beep.play().then(() => {
          _beep.pause();
          _audioUnlocked = true;
          resolve();
        }).catch(() => resolve());
      } catch (_) {
        resolve();
      }
    });
  }

  function playBridgeTone() {
    void unlockBridgeAudio().then(() => {
      try {
        if (!_beep) {
          _beep = new Audio(beepDataUri());
          _beep.volume = 0.45;
        }
        _beep.currentTime = 0;
        void _beep.play();
      } catch (_) {}
    });
  }

  function ensureNotifStyles() {
    if (document.getElementById('roots-bridge-notif-styles')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.cdnfonts.com/css/circular-std';
    document.head.appendChild(link);
    const s = document.createElement('style');
    s.id = 'roots-bridge-notif-styles';
    s.textContent = `
      #roots-bridge-notif-stack {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: min(380px, calc(100vw - 32px));
        pointer-events: none;
        font-family: 'Circular Std', system-ui, -apple-system, sans-serif;
      }
      .roots-bridge-notif-toast {
        pointer-events: auto;
        display: flex;
        gap: 10px;
        align-items: flex-start;
        width: 100%;
        padding: 14px 16px;
        border-radius: 14px;
        border: 1px solid #e2e8f0;
        border-left: 4px solid #206efb;
        background: #fff;
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
        cursor: pointer;
        text-align: left;
        font-family: 'Circular Std', system-ui, -apple-system, sans-serif;
        opacity: 0;
        transform: translateX(20px);
        transition: opacity .28s ease, transform .28s ease;
      }
      .roots-bridge-notif-toast.is-in { opacity: 1; transform: none; }
      .roots-bridge-notif-toast.is-out { opacity: 0; transform: translateX(20px); }
      .roots-bridge-notif-toast-icon {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        background: #eff6ff;
        color: #206efb;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .roots-bridge-notif-toast-body { min-width: 0; flex: 1; }
      .roots-bridge-notif-toast-title { font-size: .88rem; font-weight: 700; color: #0f172a; margin-bottom: .2rem; }
      .roots-bridge-notif-toast-msg { font-size: .8rem; color: #475569; line-height: 1.45; }
      @media (max-width: 900px) {
        #roots-bridge-notif-stack {
          right: 12px;
          left: 12px;
          bottom: 12px;
          max-width: none;
        }
      }
    `;
    document.head.appendChild(s);
  }

  function ensureNotifStack() {
    ensureNotifStyles();
    let stack = document.getElementById('roots-bridge-notif-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'roots-bridge-notif-stack';
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    return stack;
  }

  function notifIcon(type) {
    return String(type || '').startsWith('urlaub') ? 'fa-umbrella-beach' : 'fa-bell';
  }

  function showBridgeToast(notification) {
    if (!IN_IFRAME || !notification?.id) return;
    if (toastShownIds.has(notification.id) || visibleToastIds.has(notification.id)) return;
    toastShownIds.add(notification.id);
    visibleToastIds.add(notification.id);
    const stack = ensureNotifStack();
    const icon = notifIcon(notification.type);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'roots-bridge-notif-toast';
    el.dataset.notifId = notification.id;
    el.innerHTML = `<span class="roots-bridge-notif-toast-icon"><i class="fa-solid ${icon}"></i></span>
      <span class="roots-bridge-notif-toast-body">
        <div class="roots-bridge-notif-toast-title">${escapeHtml(notification.title || 'Benachrichtigung')}</div>
        <div class="roots-bridge-notif-toast-msg">${escapeHtml(notification.message || '')}</div>
      </span>`;
    const dismissToast = () => {
      visibleToastIds.delete(notification.id);
      el.remove();
    };
    el.addEventListener('click', () => {
      window.parent.postMessage({ type: 'roots-notification-click', id: notification.id }, ORIGIN);
      dismissToast();
    });
    stack.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    setTimeout(() => {
      if (!el.parentElement) return;
      el.classList.remove('is-in');
      el.classList.add('is-out');
      setTimeout(dismissToast, 320);
    }, TOAST_MS);
  }

  function patch(RU) {
    if (!RU || RU._bridgePatched) return;
    RU._bridgePatched = true;
    const origOpen = RU.openSettings ? RU.openSettings.bind(RU) : null;

    RU.openSettings = function () {
      if (IN_IFRAME) {
        window.parent.postMessage({ type: 'roots-open-settings' }, ORIGIN);
        return;
      }
      if (origOpen) origOpen();
    };

    if (IN_IFRAME) {
      document.getElementById('roots-user-settings-modal')?.remove();
      document.getElementById('rus-overlay')?.remove();
    }
  }

  function onProfileUpdate(RU, profile) {
    if (!RU || !profile) return;
    RU._p = { ...(RU._p || {}), ...profile };
    RU._mount?.();
    if (typeof window.onRootsTeamRefresh === 'function') window.onRootsTeamRefresh();
  }

  if (IN_IFRAME) {
    const unlock = () => { void unlockBridgeAudio(); };
    document.addEventListener('click', unlock, { passive: true, once: false });
    document.addEventListener('keydown', unlock, { passive: true, once: false });
    document.addEventListener('touchstart', unlock, { passive: true, once: false });
  }

  const SUPABASE_REF = 'csmguwcvzreefluhahyu';
  const AUTH_STORAGE_KEY = `sb-${SUPABASE_REF}-auth-token`;
  let _lastAuthFingerprint = null;
  let _hadSession = false;

  function dispatchAuthReady(session) {
    window.dispatchEvent(new CustomEvent('roots-auth-ready', { detail: { session } }));
  }

  function getSupabaseClient() {
    return window.__rootsSupabaseClient || window.RootsUser?._sb || null;
  }

  function sessionFromStorageRaw(raw) {
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      const access_token = data.access_token || data.currentSession?.access_token;
      const refresh_token = data.refresh_token || data.currentSession?.refresh_token;
      if (!access_token || !refresh_token) return null;
      return { access_token, refresh_token };
    } catch (_) {
      return null;
    }
  }

  function readAuthStorageRaw() {
    try {
      return window.top.localStorage.getItem(AUTH_STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  async function applyAuthSync(sessionPayload) {
    const sb = getSupabaseClient();
    if (!sb) return;
    try {
      if (sessionPayload?.access_token && sessionPayload?.refresh_token) {
        const { data, error } = await sb.auth.setSession({
          access_token: sessionPayload.access_token,
          refresh_token: sessionPayload.refresh_token,
        });
        if (error) {
          console.warn('RootsAuthBridge setSession', error.message);
          return;
        }
        _hadSession = true;
        if (data?.session) dispatchAuthReady(data.session);
      } else if (sessionPayload === null && _hadSession) {
        await sb.auth.signOut({ scope: 'local' });
        _hadSession = false;
      }
    } catch (e) {
      console.warn('RootsAuthBridge applyAuthSync', e);
    }
  }

  async function syncAuthFromParentStorage() {
    const sb = getSupabaseClient();
    if (!sb) return;
    const raw = readAuthStorageRaw();
    if (raw === _lastAuthFingerprint) return;
    _lastAuthFingerprint = raw;
    await applyAuthSync(sessionFromStorageRaw(raw));
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== ORIGIN) return;
    if (e.data?.type === 'roots-profile-updated') {
      onProfileUpdate(window.RootsUser, e.data.profile);
    }
    if (e.data?.type === 'roots-notification-toast') {
      showBridgeToast(e.data.notification);
      playBridgeTone();
    }
    if (e.data?.type === 'roots-auth-sync') {
      void applyAuthSync(e.data.session ?? null);
    }
    if (e.data?.type === 'roots-notes-refresh') {
      void syncAuthFromParentStorage();
    }
  });

  if (IN_IFRAME) {
    setInterval(() => { void syncAuthFromParentStorage(); }, 1500);
    setTimeout(() => { void syncAuthFromParentStorage(); }, 250);
  }

  function tryPatch() {
    if (window.RootsUser) patch(window.RootsUser);
  }

  tryPatch();
  let n = 0;
  const t = setInterval(() => {
    tryPatch();
    if (++n > 100 || (window.RootsUser && window.RootsUser._bridgePatched)) clearInterval(t);
  }, 50);

  window.RootsUserBridge = { IN_IFRAME, patch, ORIGIN, showBridgeToast, playBridgeTone, applyAuthSync, syncAuthFromParentStorage };
})();
