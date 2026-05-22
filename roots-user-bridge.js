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

  const SYNC_INTERVAL_MS = 20000;
  const SUPABASE_REF = 'csmguwcvzreefluhahyu';
  const SB_LABEL = `Supabase · ${SUPABASE_REF}`;

  /** @type {{ match: RegExp, tool: string, dbs: string[] }[]} */
  const TOOL_DB_REGISTRY = [
    {
      match: /team-kalender|Team-Kalender/i,
      tool: 'Team-Kalender',
      dbs: [
        `${SB_LABEL} · users.profiles (Auth)`,
        `${SB_LABEL} · team_kalender.events, team_members, nrw_holidays`,
        `${SB_LABEL} · Edge Function team-kalender`,
      ],
    },
    {
      match: /urlaubsplanung|vacation/i,
      tool: 'Urlaubsplanung',
      dbs: [
        `${SB_LABEL} · users.profiles (Auth)`,
        `${SB_LABEL} · team_kalender.urlaub_requests, roots_closure_days`,
        `${SB_LABEL} · Edge Function urlaubsplanung`,
      ],
    },
    {
      match: /ROOTS_SOP|SOP_Tool|\bsop\b/i,
      tool: 'SOP Tool',
      dbs: [
        `${SB_LABEL} · users.profiles (Auth)`,
        'PythonAnywhere · PGoutzeris.pythonanywhere.com (SOP-Inhalte)',
        'Browser · localStorage (Autosave)',
      ],
    },
    {
      match: /Zeiterfassung|zeiterfassung|ROOTS.?TIME/i,
      tool: 'Zeiterfassung',
      dbs: [
        `${SB_LABEL} · users.profiles (Auth)`,
        `${SB_LABEL} · zeiterfassung.profiles, categories, projects, tasks, time_entries`,
      ],
    },
    {
      match: /Notes-Tool|\bnotes\b/i,
      tool: 'Notes',
      dbs: [
        `${SB_LABEL} · users.profiles (Auth)`,
        `${SB_LABEL} · notes.folders, notes.documents`,
      ],
    },
    {
      match: /onboarding/i,
      tool: 'Onboarding',
      dbs: [
        `${SB_LABEL} · users.profiles (Auth)`,
        `${SB_LABEL} · onboarding.user_progress`,
      ],
    },
    {
      match: /image-generation|Image-Generation/i,
      tool: 'Image Generator',
      dbs: [
        `${SB_LABEL} · users.profiles (Auth)`,
        'Extern · Google Gemini API (Generierung, kein DB-Speicher)',
      ],
    },
    {
      match: /whiteboard/i,
      tool: 'Whiteboard',
      dbs: [
        `${SB_LABEL} · users.profiles (Auth)`,
        `${SB_LABEL} · public.wb_boards, wb_objects, wb_comments, wb_snapshots`,
      ],
    },
    {
      match: /RecruitingApp|recruiting/i,
      tool: 'Recruiting',
      dbs: [
        `${SB_LABEL} · users.profiles (Auth)`,
        `${SB_LABEL} · recruiting.applicants, interviews, notifications`,
      ],
    },
  ];

  function normalizeDatabaseList(list) {
    if (!list) return [];
    const arr = Array.isArray(list) ? list : [list];
    return arr.map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        const label = item.label || item.name || item.schema || 'Datenbank';
        const detail = item.detail || item.tables || item.url || '';
        return detail ? `${label} · ${detail}` : String(label);
      }
      return String(item);
    }).filter(Boolean);
  }

  function resolveToolMeta() {
    const cfg = window.RootsSyncStatusConfig || {};
    if (cfg.toolName || cfg.databases) {
      return {
        tool: cfg.toolName || document.title?.split('–')[0]?.trim() || 'ROOTS Tool',
        databases: normalizeDatabaseList(cfg.databases),
      };
    }
    const path = `${window.location.pathname}${window.location.hash}${window.location.href}`;
    for (const entry of TOOL_DB_REGISTRY) {
      if (entry.match.test(path)) {
        return { tool: entry.tool, databases: entry.dbs.slice() };
      }
    }
    return {
      tool: document.title?.split('–')[0]?.trim() || 'ROOTS Tool',
      databases: [`${SB_LABEL} · users.profiles (Auth/Profil)`],
    };
  }

  function databaseTermLines(meta) {
    const lines = [`tool    ${meta.tool}`];
    (meta.databases || []).forEach((db, i) => {
      lines.push(`${i === 0 ? 'store   ' : '        '}${db}`);
    });
    return lines;
  }

  function ensureSyncStyles() {
    if (document.getElementById('roots-sync-status-styles')) return;
    const s = document.createElement('style');
    s.id = 'roots-sync-status-styles';
    s.textContent = `
      .roots-sync-wrap { position: relative; flex-shrink: 0; }
      .roots-sync-pill {
        display: inline-flex; align-items: center; gap: 7px;
        height: 32px; padding: 0 12px 0 10px; border-radius: 999px;
        border: 1px solid #e2e8f0; background: #fff; font-size: 12px; font-weight: 600;
        color: #475569; cursor: default; user-select: none;
        font-family: 'Circular Std', system-ui, -apple-system, sans-serif;
        transition: background .2s, border-color .2s, color .2s;
      }
      .roots-sync-pill.is-online { border-color: #bbf7d0; background: #f0fdf4; color: #15803d; }
      .roots-sync-pill.is-offline { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
      .roots-sync-pill.is-checking { opacity: .88; }
      .roots-sync-dot {
        width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0;
      }
      .roots-sync-pill.is-online .roots-sync-dot {
        background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,.18);
      }
      .roots-sync-pill.is-offline .roots-sync-dot { background: #ef4444; }
      .roots-sync-term {
        display: none; position: absolute; top: calc(100% + 8px); right: 0;
        width: min(360px, calc(100vw - 24px)); padding: 10px 12px;
        border-radius: 10px; border: 1px solid #334155; background: #0f172a;
        box-shadow: 0 14px 36px rgba(0,0,0,.28); z-index: 99999;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 11px; line-height: 1.55; color: #94a3b8; text-align: left;
        pointer-events: auto;
      }
      .roots-sync-wrap:hover .roots-sync-term,
      .roots-sync-wrap:focus-within .roots-sync-term { display: block; }
      .roots-sync-term-head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; margin-bottom: 6px;
      }
      .roots-sync-term-title {
        font-size: 10px; letter-spacing: .04em; text-transform: lowercase;
        color: #64748b; margin: 0;
      }
      .roots-sync-copy-btn {
        flex-shrink: 0; border: 1px solid #334155; background: #1e293b; color: #cbd5e1;
        font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 6px;
        cursor: pointer; font-family: inherit; line-height: 1.2;
        transition: background .15s, border-color .15s, color .15s;
      }
      .roots-sync-copy-btn:hover {
        background: #334155; border-color: #475569; color: #f8fafc;
      }
      .roots-sync-copy-btn.is-done {
        color: #4ade80; border-color: #166534; background: #052e16;
      }
      .roots-sync-term-line { white-space: pre-wrap; word-break: break-word; margin: 0; }
      .roots-sync-term-line.is-ok { color: #4ade80; }
      .roots-sync-term-line.is-err { color: #f87171; }
      .roots-sync-term-line.is-warn { color: #fbbf24; }
      .roots-sync-term-line.is-dim { color: #64748b; }
      .roots-sync-term-line.is-data { color: #7dd3fc; }
    `;
    document.head.appendChild(s);
  }

  function findToolHeaderRight() {
    return document.querySelector(
      '.sop-header .header-right, .app-topbar .header-right, .app-header .header-right, header[role="banner"] .header-right'
    );
  }

  function hideLegacyProfileHeader() {
    const headerRight = findToolHeaderRight();
    if (!headerRight) return;
    headerRight.querySelectorAll(
      '#roots-header-avatar, #user-avatar, #roots-header-name, #user-name-topbar, .app-user-avatar, .app-user-name, .dash-avatar, #syncBadge, .sync-badge'
    ).forEach((el) => {
      el.hidden = true;
      el.style.display = 'none';
    });
  }

  function classifyTermLine(line) {
    const t = String(line || '').trim();
    if (/^tool\s+/i.test(t) || /^store\s+/i.test(t)) return 'is-data';
    if (/^status\s+online/i.test(t)) return 'is-ok';
    if (/^status\s+offline/i.test(t) || /^error/i.test(t) || /^code/i.test(t)) return 'is-err';
    if (/^warn/i.test(t) || /^hint/i.test(t)) return 'is-warn';
    if (/^db\s+synced/i.test(t) || /^auth\s+session ok/i.test(t)) return 'is-ok';
    return 'is-dim';
  }

  function termLineHtml(line) {
    const kind = classifyTermLine(line);
    return `<div class="roots-sync-term-line ${kind}">${escapeHtml(line)}</div>`;
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }

  const SyncStatus = {
    _timer: null,
    _sb: null,
    _checking: false,
    _copyTimer: null,
    _state: { online: null, lines: ['status  initializing…'], lastCheck: null, latencyMs: null },

    ensureSlot() {
      hideLegacyProfileHeader();
      let slot = document.getElementById('roots-sync-status');
      const headerRight = findToolHeaderRight();
      if (!slot && headerRight) {
        slot = document.createElement('div');
        slot.id = 'roots-sync-status';
        slot.className = 'roots-sync-wrap';
        slot.setAttribute('aria-live', 'polite');
        headerRight.appendChild(slot);
      }
      if (slot && !slot.dataset.copyBound) {
        slot.dataset.copyBound = '1';
        slot.addEventListener('click', (e) => {
          const btn = e.target.closest('.roots-sync-copy-btn');
          if (!btn) return;
          e.preventDefault();
          e.stopPropagation();
          void SyncStatus.copyTerminal(btn);
        });
      }
      return slot;
    },

    getTerminalPlainText() {
      const meta = resolveToolMeta();
      const stamp = this._state.lastCheck
        ? new Date(this._state.lastCheck).toLocaleTimeString('de-DE')
        : '—';
      return [
        'roots sync monitor',
        ...databaseTermLines(meta),
        '',
        ...(this._state.lines || []),
        `checked  ${stamp}`,
      ].join('\n');
    },

    async copyTerminal(btn) {
      try {
        await copyTextToClipboard(this.getTerminalPlainText());
        const label = btn.textContent;
        btn.classList.add('is-done');
        btn.textContent = 'Kopiert';
        if (this._copyTimer) clearTimeout(this._copyTimer);
        this._copyTimer = setTimeout(() => {
          btn.classList.remove('is-done');
          btn.textContent = label;
        }, 1400);
      } catch (_) {
        btn.textContent = 'Fehler';
        if (this._copyTimer) clearTimeout(this._copyTimer);
        this._copyTimer = setTimeout(() => {
          btn.textContent = 'Kopieren';
        }, 1400);
      }
    },

    render() {
      const slot = this.ensureSlot();
      if (!slot) return;
      ensureSyncStyles();
      const meta = resolveToolMeta();
      const online = this._state.online === true;
      const checking = this._checking;
      const label = checking ? 'Prüfe…' : (online ? 'Online' : 'Offline');
      const cls = checking ? 'is-checking' : (online ? 'is-online' : 'is-offline');
      const dbLines = databaseTermLines(meta).map(termLineHtml).join('');
      const lines = (this._state.lines || []).map(termLineHtml).join('');
      const stamp = this._state.lastCheck
        ? new Date(this._state.lastCheck).toLocaleTimeString('de-DE')
        : '—';
      slot.innerHTML = `
        <div class="roots-sync-pill ${cls}" title="Supabase Sync-Status">
          <span class="roots-sync-dot" aria-hidden="true"></span>
          <span class="roots-sync-label">${escapeHtml(label)}</span>
        </div>
        <div class="roots-sync-term" role="tooltip">
          <div class="roots-sync-term-head">
            <div class="roots-sync-term-title">roots sync monitor</div>
            <button type="button" class="roots-sync-copy-btn" title="Terminal-Inhalt kopieren">Kopieren</button>
          </div>
          ${dbLines}
          <div class="roots-sync-term-line is-dim" aria-hidden="true">&nbsp;</div>
          ${lines}
          <div class="roots-sync-term-line is-dim">checked  ${escapeHtml(stamp)}</div>
        </div>`;
    },

    async ping(sb) {
      const started = Date.now();
      const lines = [];
      const customPing = window.RootsSyncStatusConfig?.ping;
      if (typeof customPing === 'function') {
        const result = await customPing(sb);
        return {
          online: !!result?.online,
          lines: Array.isArray(result?.lines) ? result.lines : [result?.online ? 'status  online' : 'status  offline'],
          latencyMs: Date.now() - started,
        };
      }
      if (!sb) {
        return {
          online: false,
          lines: ['status  offline', 'error   no_supabase_client', 'hint    warte auf auth-session…'],
          latencyMs: null,
        };
      }
      const { data: { session }, error: sessErr } = await sb.auth.getSession();
      if (sessErr) lines.push(`error   ${sessErr.message}`);
      if (!session) {
        lines.push('status  offline', 'error   no_active_session', 'hint    bitte neu anmelden');
        return { online: false, lines, latencyMs: Date.now() - started };
      }
      lines.push(`auth    session ok (${session.user.id.slice(0, 8)}…)`);
      try {
        const { error } = await sb.schema('users').from('profiles').select('id', { head: true, count: 'exact' }).limit(1);
        const ms = Date.now() - started;
        if (error) {
          lines.push(`db      fail (${ms}ms)`);
          if (error.code) lines.push(`code    ${error.code}`);
          lines.push(`error   ${error.message}`);
          lines.push('status  offline');
          return { online: false, lines, latencyMs: ms };
        }
        lines.push(`db      synced (${ms}ms)`);
        lines.push('status  online');
        return { online: true, lines, latencyMs: ms };
      } catch (e) {
        const ms = Date.now() - started;
        lines.push(`db      fail (${ms}ms)`);
        lines.push(`error   ${e.message || 'network_error'}`);
        lines.push('status  offline');
        return { online: false, lines, latencyMs: ms };
      }
    },

    async check() {
      if (this._checking) return;
      this._checking = true;
      this.render();
      try {
        const sb = this._sb || getSupabaseClient();
        const result = await this.ping(sb);
        this._state = {
          online: result.online,
          lines: result.lines,
          lastCheck: Date.now(),
          latencyMs: result.latencyMs,
        };
      } catch (e) {
        this._state = {
          online: false,
          lines: ['status  offline', `error   ${e.message || 'check_failed'}`],
          lastCheck: Date.now(),
          latencyMs: null,
        };
      } finally {
        this._checking = false;
        this.render();
      }
    },

    mount(sb) {
      this._sb = sb || getSupabaseClient();
      ensureSyncStyles();
      this.ensureSlot();
      void this.check();
      if (this._timer) clearInterval(this._timer);
      this._timer = setInterval(() => void this.check(), SYNC_INTERVAL_MS);
    },

    stop() {
      if (this._timer) clearInterval(this._timer);
      this._timer = null;
    },
  };

  function patchSyncHeader(RU) {
    if (!RU || RU._syncHeaderPatched) return;
    RU._syncHeaderPatched = true;
    const origMount = typeof RU._mount === 'function' ? RU._mount.bind(RU) : null;
    RU._mount = function (...args) {
      if (origMount) origMount(...args);
      hideLegacyProfileHeader();
      SyncStatus.mount(RU._sb || getSupabaseClient());
    };
    const origLoad = typeof RU._loadAndMount === 'function' ? RU._loadAndMount.bind(RU) : null;
    if (origLoad) {
      RU._loadAndMount = async function (...args) {
        await origLoad(...args);
        hideLegacyProfileHeader();
        SyncStatus.mount(RU._sb || getSupabaseClient());
      };
    }
  }

  function patch(RU) {
    if (!RU || RU._bridgePatched) return;
    RU._bridgePatched = true;
    patchSyncHeader(RU);
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

  const AUTH_STORAGE_KEY = `sb-${SUPABASE_REF}-auth-token`;
  let _lastAuthFingerprint = null;
  let _hadSession = false;
  let _syncInFlight = null;

  function dispatchAuthReady(session) {
    window.dispatchEvent(new CustomEvent('roots-auth-ready', { detail: { session } }));
  }

  function dispatchAuthSignedOut() {
    window.dispatchEvent(new CustomEvent('roots-auth-signed-out'));
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
      try {
        return window.localStorage.getItem(AUTH_STORAGE_KEY);
      } catch (_) {
        return null;
      }
    }
  }

  async function hydrateSessionFromParentStorage() {
    const sb = getSupabaseClient();
    if (!sb) return null;
    const raw = readAuthStorageRaw();
    const payload = sessionFromStorageRaw(raw);
    if (!payload) return null;

    const { data: { session: current } } = await sb.auth.getSession();
    if (current?.access_token === payload.access_token) {
      _hadSession = true;
      return current;
    }

    const { data, error } = await sb.auth.setSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    });
    if (error) {
      console.warn('RootsAuthBridge hydrateSession', error.message);
      return current || null;
    }
    _hadSession = true;
    return data?.session || null;
  }

  async function syncAuthFromParentStorage() {
    if (_syncInFlight) return _syncInFlight;
    _syncInFlight = (async () => {
      const raw = readAuthStorageRaw();
      if (raw === _lastAuthFingerprint && _hadSession) {
        const sb = getSupabaseClient();
        const { data: { session } } = sb ? await sb.auth.getSession() : { data: { session: null } };
        if (session) return session;
      }
      _lastAuthFingerprint = raw;
      const session = await hydrateSessionFromParentStorage();
      if (session) dispatchAuthReady(session);
      return session;
    })().finally(() => {
      _syncInFlight = null;
    });
    return _syncInFlight;
  }

  async function applyAuthSignOut() {
    _hadSession = false;
    _lastAuthFingerprint = null;
    dispatchAuthSignedOut();
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
      if (e.data.signOut) void applyAuthSignOut();
      else void syncAuthFromParentStorage();
    }
    if (e.data?.type === 'roots-notes-refresh') {
      void syncAuthFromParentStorage();
    }
  });

  if (IN_IFRAME) {
    window.addEventListener('storage', (e) => {
      if (e.key === AUTH_STORAGE_KEY) void syncAuthFromParentStorage();
    });
    const waitForClient = (n) => {
      if (getSupabaseClient()) void syncAuthFromParentStorage();
      else if (n < 120) setTimeout(() => waitForClient(n + 1), 50);
    };
    waitForClient(0);
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

  window.addEventListener('roots-auth-ready', () => SyncStatus.mount(getSupabaseClient()));
  window.addEventListener('roots-auth-signed-out', () => {
    SyncStatus._state = { online: false, lines: ['status  offline', 'error   signed_out'], lastCheck: Date.now(), latencyMs: null };
    SyncStatus.mount(getSupabaseClient());
  });

  window.RootsUserBridge = {
    IN_IFRAME,
    patch,
    ORIGIN,
    showBridgeToast,
    playBridgeTone,
    syncAuthFromParentStorage,
    applyAuthSignOut,
    SyncStatus,
    mountSyncStatus: (sb) => SyncStatus.mount(sb),
  };

  const bootSync = (n) => {
    if (window.RootsUser) patch(window.RootsUser);
    const sb = getSupabaseClient();
    if (sb || document.getElementById('roots-sync-status') || findToolHeaderRight()) {
      SyncStatus.mount(sb);
    } else if (n < 160) {
      setTimeout(() => bootSync(n + 1), 50);
    }
  };
  bootSync(0);
})();
