(function () {
  const ORIGIN = 'https://pgoutzeris-stack.github.io';
  const IN_IFRAME = window.parent !== window;

  /**
   * Reliable macOS Tauri app detection:
   * webkit-ui-fix.js (the Tauri initialization script baked into the binary)
   * sets window.__rootsWebkitUiFix = true at document start — ONLY in the
   * native app. Never set in a regular browser, regardless of origin.
   *
   * IN_TAURI is true only in the Tauri macOS app (main frame OR iframes,
   * since webkit-ui-fix.js injects into all frames).
   */
  const IN_TAURI = window.__rootsWebkitUiFix === true;

  // Legacy — kept for potential future use
  const IN_MAC_APP = IN_IFRAME && /ROOTS-MacApp/.test(navigator.userAgent);

  /* ── Visuelles Debug-Overlay (nur in der Tauri macOS App) ───────────────
   * Fängt console.log/warn/error ab und zeigt sie als Overlay-Panel.
   * Erscheint automatisch beim ersten Log-Aufruf.
   * Schließen: × Button. Wird nach 60s automatisch entfernt.
   * ─────────────────────────────────────────────────────────────────────── */
  (function installDebugOverlay() {
    // In iframe: logs per postMessage an den Parent (Intranet) schicken
    // Im Parent (IN_TAURI): Panel anzeigen + iframe-Logs empfangen
    const isParent = IN_TAURI && !IN_IFRAME;
    const isChild  = IN_IFRAME;
    if (!isParent && !isChild) return;

    let panel = null, logList = null, closeTimer = null;

    function ensurePanel() {
      if (panel || !isParent) return;
      panel = document.createElement('div');
      panel.id = 'roots-debug-panel';
      panel.style.cssText = [
        'position:fixed','bottom:12px','right:12px','z-index:2147483647',
        'width:460px','max-height:380px',
        'background:#0f172a','color:#e2e8f0',
        'border-radius:10px','border:1.5px solid #206efb',
        'box-shadow:0 8px 32px rgba(0,0,0,.6)',
        'font-family:ui-monospace,monospace','font-size:11px','line-height:1.4',
        'display:flex','flex-direction:column','overflow:hidden'
      ].join(';');
      const hdr = document.createElement('div');
      hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#1e3a5f;border-bottom:1px solid #206efb;flex-shrink:0';
      hdr.innerHTML = '<span style="color:#60a5fa;font-weight:700;font-size:12px">🔍 ROOTS Debug – Link-Prüfung</span>';
      const x = document.createElement('button');
      x.textContent = '×';
      x.style.cssText = 'background:none;border:none;color:#94a3b8;font-size:16px;cursor:pointer;padding:0 4px';
      x.onclick = () => { panel.remove(); panel = null; logList = null; };
      hdr.appendChild(x);
      panel.appendChild(hdr);
      logList = document.createElement('div');
      logList.style.cssText = 'overflow-y:auto;flex:1;padding:6px 10px';
      panel.appendChild(logList);
      document.body.appendChild(panel);
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => { panel?.remove(); panel = null; logList = null; }, 180000);
    }

    function addLog(level, source, text) {
      if (!isParent) return;
      ensurePanel();
      if (!logList) return;
      const colors = { log:'#94a3b8', warn:'#fbbf24', error:'#f87171', info:'#60a5fa' };
      const icons  = { log:'›', warn:'⚠', error:'✕', info:'ℹ' };
      const tag = source === 'iframe' ? '<span style="color:#f59e0b;font-size:9px">[iframe]</span> ' : '';
      const line = document.createElement('div');
      line.style.cssText = `color:${colors[level]||'#94a3b8'};padding:2px 0;border-bottom:1px solid #1e293b;word-break:break-all`;
      line.innerHTML = `${icons[level]||'›'} ${tag}${text.replace(/</g,'&lt;')}`;
      logList.appendChild(line);
      logList.scrollTop = logList.scrollHeight;
    }

    if (isParent) {
      // Empfange Logs von iframes
      window.addEventListener('message', (e) => {
        if (e.data?.type === 'roots-debug-log') {
          addLog(e.data.level, 'iframe', e.data.text);
        }
      });
      // Eigene Logs abfangen
      ['log','warn','error','info'].forEach(lvl => {
        const orig = console[lvl].bind(console);
        console[lvl] = (...args) => {
          orig(...args);
          const txt = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
          if (txt.includes('[ROOTS')) addLog(lvl, 'main', txt);
        };
      });
    }

    if (isChild) {
      // Logs an Parent schicken
      ['log','warn','error','info'].forEach(lvl => {
        const orig = console[lvl].bind(console);
        console[lvl] = (...args) => {
          orig(...args);
          const txt = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
          if (txt.includes('[ROOTS')) {
            try { window.parent.postMessage({ type:'roots-debug-log', level:lvl, text:txt }, ORIGIN); } catch(_) {}
          }
        };
      });
    }
  })();

  const TOAST_MS = 9000;
  const visibleToastIds = new Set();
  const toastShownIds = new Set();

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  const BRIDGE_VERSION = '20260522-hover';

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  function supabaseRefFromUrl(url) {
    try {
      const host = new URL(String(url)).hostname;
      const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
      return m ? m[1] : null;
    } catch (_) {
      return null;
    }
  }

  function supabaseProjectHref(ref) {
    return `https://supabase.com/dashboard/project/${ref}`;
  }

  function supabaseTableHref(ref, schema, table) {
    const base = supabaseProjectHref(ref);
    const safeSchema = encodeURIComponent(schema || 'public');
    const safeTable = encodeURIComponent(table || '');
    if ((schema || 'public') === 'public') {
      return `${base}/editor?filter=table:${safeTable}`;
    }
    return `${base}/editor?schema=${safeSchema}&filter=table:${safeTable}`;
  }

  function supabaseFunctionHref(ref, name) {
    return `${supabaseProjectHref(ref)}/functions/${encodeURIComponent(name)}`;
  }

  function supabaseAuthHref(ref) {
    return `${supabaseProjectHref(ref)}/auth/users`;
  }

  function supabaseStorageHref(ref) {
    return `${supabaseProjectHref(ref)}/storage/buckets`;
  }

  function requestHeaders(init) {
    const h = new Headers();
    if (!init?.headers) return h;
    const raw = init.headers;
    if (raw instanceof Headers) raw.forEach((v, k) => h.set(k, v));
    else if (Array.isArray(raw)) raw.forEach(([k, v]) => h.set(k, v));
    else Object.entries(raw).forEach(([k, v]) => h.set(k, v));
    return h;
  }

  function headerValue(headers, name) {
    return headers.get(name) || headers.get(name.toLowerCase()) || '';
  }

  function normalizeSourceEntry(item) {
    if (!item) return null;
    if (typeof item === 'string') {
      const text = item.trim();
      if (!text) return null;
      const urlMatch = text.match(/https?:\/\/[^\s]+/);
      return {
        id: `manual:${text}`,
        kind: 'manual',
        label: text.replace(/https?:\/\/[^\s]+/g, '').replace(/^[·\s-]+|[·\s-]+$/g, '') || text,
        href: urlMatch ? urlMatch[0] : null,
      };
    }
    if (typeof item === 'object') {
      const label = item.label || item.name || item.schema || 'Datenbank';
      const detail = item.detail || item.tables || '';
      const href = item.href || item.url || null;
      return {
        id: item.id || `manual:${label}:${detail}`,
        kind: item.kind || 'manual',
        label: detail ? `${label} · ${detail}` : String(label),
        href,
      };
    }
    return null;
  }

  const DataSourceTracker = {
    _sources: new Map(),
    _renderTimer: null,
    _installed: false,
    _clientWatchTimer: null,

    install() {
      if (this._installed) return;
      this._installed = true;
      this._patchFetch();
      this._patchXHR();
      this._patchCreateClient();
      this._patchLocalStorage();
      this._scanLocalStorage();
      this._watchExistingClients();
    },

    _scheduleRender() {
      if (this._renderTimer) clearTimeout(this._renderTimer);
      this._renderTimer = setTimeout(() => {
        this._renderTimer = null;
        if (typeof SyncStatus !== 'undefined') SyncStatus.render();
      }, 120);
    },

    _remember(entry) {
      const id = entry.id;
      if (!id) return;
      const prev = this._sources.get(id);
      if (prev) {
        prev.hits = (prev.hits || 0) + 1;
        prev.lastSeen = Date.now();
        if (entry.href && !prev.href) prev.href = entry.href;
      } else {
        this._sources.set(id, { ...entry, hits: 1, lastSeen: Date.now() });
      }
      this._scheduleRender();
    },

    noteTable(ref, schema, table) {
      const sch = schema || 'public';
      const tbl = String(table || '').split('?')[0];
      if (!ref || !tbl || tbl === 'rpc') return;
      this._remember({
        id: `sb-table:${ref}:${sch}.${tbl}`,
        kind: 'supabase-table',
        ref,
        schema: sch,
        table: tbl,
        label: `${sch}.${tbl}`,
        href: supabaseTableHref(ref, sch, tbl),
      });
    },

    noteRpc(ref, schema, fnName) {
      const sch = schema || 'public';
      const fn = String(fnName || '').trim();
      if (!ref || !fn) return;
      this._remember({
        id: `sb-rpc:${ref}:${sch}.${fn}`,
        kind: 'supabase-rpc',
        ref,
        schema: sch,
        label: `${sch}.rpc(${fn})`,
        href: `${supabaseProjectHref(ref)}/database/functions`,
      });
    },

    noteFunction(ref, name) {
      const fn = String(name || '').split('?')[0];
      if (!ref || !fn) return;
      this._remember({
        id: `sb-fn:${ref}:${fn}`,
        kind: 'supabase-function',
        ref,
        label: `Edge Function ${fn}`,
        href: supabaseFunctionHref(ref, fn),
      });
    },

    noteAuth(ref) {
      if (!ref) return;
      this._remember({
        id: `sb-auth:${ref}`,
        kind: 'supabase-auth',
        ref,
        label: 'Supabase Auth',
        href: supabaseAuthHref(ref),
      });
    },

    noteStorage(ref, bucket) {
      if (!ref) return;
      const label = bucket ? `Storage · ${bucket}` : 'Supabase Storage';
      this._remember({
        id: `sb-storage:${ref}:${bucket || 'all'}`,
        kind: 'supabase-storage',
        ref,
        label,
        href: supabaseStorageHref(ref),
      });
    },

    noteProject(ref, label) {
      if (!ref) return;
      this._remember({
        id: `sb-project:${ref}`,
        kind: 'supabase-project',
        ref,
        label: label || `Supabase · ${ref}`,
        href: supabaseProjectHref(ref),
      });
    },

    noteExternal(url, label) {
      try {
        const u = new URL(url);
        this._remember({
          id: `ext:${u.origin}`,
          kind: 'external-api',
          label: label || u.hostname,
          href: u.origin,
        });
      } catch (_) {}
    },

    noteLocalStorage(key) {
      const k = String(key || '').trim();
      if (!k) return;
      this._remember({
        id: `local:${k}`,
        kind: 'browser-storage',
        label: `Browser · localStorage.${k}`,
        href: null,
      });
    },

    observeRequest(url, init) {
      let u;
      try {
        u = new URL(String(url), window.location.href);
      } catch (_) {
        return;
      }

      const sbRef = supabaseRefFromUrl(u.href);
      if (sbRef) {
        this.noteProject(sbRef);
        const path = u.pathname || '';
        const headers = requestHeaders(init);

        if (path.startsWith('/rest/v1/')) {
          const tail = path.slice('/rest/v1/'.length);
          const resource = tail.split('/')[0]?.split('?')[0];
          const schema = headerValue(headers, 'Accept-Profile')
            || headerValue(headers, 'Content-Profile')
            || 'public';
          if (resource === 'rpc' && u.searchParams.get('rpc')) {
            this.noteRpc(sbRef, schema, u.searchParams.get('rpc'));
          } else if (resource) {
            this.noteTable(sbRef, schema, resource);
          }
          return;
        }

        if (path.startsWith('/functions/v1/')) {
          const fn = path.slice('/functions/v1/'.length).split('/')[0];
          this.noteFunction(sbRef, fn);
          return;
        }

        if (path.startsWith('/auth/v1/')) {
          this.noteAuth(sbRef);
          return;
        }

        if (path.startsWith('/storage/v1/')) {
          const parts = path.split('/').filter(Boolean);
          const bucket = parts[2] || '';
          this.noteStorage(sbRef, bucket);
          return;
        }

        if (path.startsWith('/realtime/v1/')) {
          this._remember({
            id: `sb-realtime:${sbRef}`,
            kind: 'supabase-realtime',
            ref: sbRef,
            label: 'Supabase Realtime',
            href: `${supabaseProjectHref(sbRef)}/database/replication`,
          });
        }
        return;
      }

      const host = u.hostname.toLowerCase();
      if (host.includes('pythonanywhere.com')) {
        this.noteExternal(u.origin, `PythonAnywhere · ${host}`);
      } else if (host.includes('googleapis.com') || host.includes('generativelanguage.googleapis.com')) {
        this.noteExternal(u.origin, `Extern · ${host}`);
      }
    },

    patchSupabaseClient(sb, ref, defaultSchema) {
      if (!sb || sb.__rootsTracked) return sb;
      sb.__rootsTracked = true;
      const projectRef = ref || supabaseRefFromUrl(sb.supabaseUrl || sb.rest?.url || '') || SUPABASE_REF;
      const baseSchema = defaultSchema || sb.rest?.headers?.['Accept-Profile'] || 'public';
      this.noteProject(projectRef);

      if (typeof sb.schema === 'function') {
        const origSchema = sb.schema.bind(sb);
        sb.schema = (schemaName) => {
          const builder = origSchema(schemaName);
          if (builder && typeof builder.from === 'function') {
            const origFrom = builder.from.bind(builder);
            builder.from = (table) => {
              this.noteTable(projectRef, schemaName, table);
              return origFrom(table);
            };
          }
          return builder;
        };
      }

      if (typeof sb.from === 'function') {
        const origFrom = sb.from.bind(sb);
        sb.from = (table) => {
          this.noteTable(projectRef, baseSchema, table);
          return origFrom(table);
        };
      }

      if (typeof sb.rpc === 'function') {
        const origRpc = sb.rpc.bind(sb);
        sb.rpc = (fn, args, opts) => {
          this.noteRpc(projectRef, baseSchema, fn);
          return origRpc(fn, args, opts);
        };
      }

      if (sb.functions && typeof sb.functions.invoke === 'function') {
        const origInvoke = sb.functions.invoke.bind(sb.functions);
        sb.functions.invoke = (name, opts) => {
          this.noteFunction(projectRef, name);
          return origInvoke(name, opts);
        };
      }

      return sb;
    },

    _patchFetch() {
      if (window.__rootsFetchPatched) return;
      window.__rootsFetchPatched = true;
      const origFetch = window.fetch.bind(window);
      window.fetch = (...args) => {
        try {
          this.observeRequest(args[0], args[1]);
        } catch (_) {}
        return origFetch(...args);
      };
    },

    _patchXHR() {
      if (window.__rootsXhrPatched) return;
      window.__rootsXhrPatched = true;
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.__rootsUrl = url;
        this.__rootsMethod = method;
        return origOpen.call(this, method, url, ...rest);
      };
      XMLHttpRequest.prototype.send = function(body) {
        try {
          DataSourceTracker.observeRequest(this.__rootsUrl, { method: this.__rootsMethod, body });
        } catch (_) {}
        return origSend.call(this, body);
      };
    },

    _patchCreateClient() {
      const tryPatch = () => {
        if (!window.supabase?.createClient || window.supabase.__rootsCreatePatched) return;
        const origCreate = window.supabase.createClient;
        window.supabase.createClient = (url, key, opts) => {
          const sb = origCreate(url, key, opts);
          const ref = supabaseRefFromUrl(url) || SUPABASE_REF;
          DataSourceTracker.patchSupabaseClient(sb, ref, opts?.db?.schema || 'public');
          return sb;
        };
        window.supabase.__rootsCreatePatched = true;
      };
      tryPatch();
      if (!window.supabase?.__rootsCreatePatched) {
        let n = 0;
        const t = setInterval(() => {
          tryPatch();
          if (window.supabase?.__rootsCreatePatched || ++n > 120) clearInterval(t);
        }, 50);
      }
    },

    _patchLocalStorage() {
      if (Storage.prototype.__rootsSetItemPatched) return;
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        try {
          if (typeof key === 'string' && /^(roots_|sop_|tk_|notes_|urlaub_)/i.test(key)) {
            DataSourceTracker.noteLocalStorage(key);
          }
        } catch (_) {}
        return orig.call(this, key, value);
      };
      Storage.prototype.__rootsSetItemPatched = true;
    },

    _scanLocalStorage() {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && /^(roots_|sop_|tk_|notes_|urlaub_)/i.test(key)) this.noteLocalStorage(key);
        }
      } catch (_) {}
    },

    _watchExistingClients() {
      const scan = () => {
        [window.__rootsSupabaseClient, window.RootsUser?._sb]
          .filter(Boolean)
          .forEach((sb) => {
            if (!sb?.auth?.getSession) return;
            const ref = supabaseRefFromUrl(sb.supabaseUrl || sb.rest?.url || '') || SUPABASE_REF;
            this.patchSupabaseClient(sb, ref, sb.rest?.headers?.['Accept-Profile'] || 'public');
          });
      };
      scan();
      if (this._clientWatchTimer) clearInterval(this._clientWatchTimer);
      this._clientWatchTimer = setInterval(scan, 1500);
    },

    listSources() {
      const manual = (window.RootsSyncStatusConfig?.databases || [])
        .map(normalizeSourceEntry)
        .filter(Boolean);
      const auto = Array.from(this._sources.values())
        .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
      const merged = new Map();
      auto.forEach((s) => merged.set(s.id, s));
      manual.forEach((s) => merged.set(s.id, { ...merged.get(s.id), ...s }));
      return Array.from(merged.values());
    },
  };

  /** legacy placeholder removed – detection is automatic via DataSourceTracker */

  function resolveToolMeta() {
    const cfg = window.RootsSyncStatusConfig || {};
    return {
      tool: cfg.toolName || document.title?.split('–')[0]?.trim() || 'ROOTS Tool',
      sources: DataSourceTracker.listSources(),
    };
  }

  function renderStoreRows(meta) {
    const sources = meta.sources || [];
    if (!sources.length) {
      return `<div class="roots-sync-term-line is-data">store   (wird beim Laden automatisch erkannt…)</div>`;
    }
    return sources.map((src, i) => {
      const prefix = i === 0 ? 'store   ' : '        ';
      const text = `${prefix}${src.label}`;
      const link = src.href
        ? `<a class="roots-sync-open-btn" href="${escapeAttr(src.href)}" target="_blank" rel="noopener noreferrer" title="Datenbank/API öffnen">↗</a>`
        : `<span class="roots-sync-open-btn is-disabled" title="Kein Dashboard-Link">·</span>`;
      return `<div class="roots-sync-store-row"><span class="roots-sync-store-label">${escapeHtml(text)}</span>${link}</div>`;
    }).join('');
  }

  function databaseTermLines(meta) {
    const lines = [`tool    ${meta.tool}`];
    (meta.sources || []).forEach((src, i) => {
      const prefix = i === 0 ? 'store   ' : '        ';
      lines.push(`${prefix}${src.label}${src.href ? `  ${src.href}` : ''}`);
    });
    if (!meta.sources?.length) lines.push('store   (wird beim Laden automatisch erkannt…)');
    return lines;
  }

  function ensureSyncStyles() {
    let s = document.getElementById('roots-sync-status-styles');
    if (!s) {
      s = document.createElement('style');
      s.id = 'roots-sync-status-styles';
      document.head.appendChild(s);
    }
    s.textContent = `
      .sop-header:has(.roots-sync-wrap),
      .app-header:has(.roots-sync-wrap),
      .app-topbar:has(.roots-sync-wrap),
      .admin-topbar:has(.roots-sync-wrap),
      header[role="banner"]:has(.roots-sync-wrap) {
        overflow: visible !important;
      }
      .sop-header .header-right:has(.roots-sync-wrap),
      .app-header .header-right:has(.roots-sync-wrap),
      .app-topbar .header-right:has(.roots-sync-wrap),
      .admin-topbar .header-right:has(.roots-sync-wrap),
      header[role="banner"] .header-right:has(.roots-sync-wrap) {
        overflow: visible !important;
        position: relative;
        z-index: 200;
      }
      .roots-sync-wrap { position: relative; flex-shrink: 0; z-index: 201; }
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
        position: fixed;
        top: 0;
        right: 0;
        width: min(360px, calc(100vw - 24px));
        padding-top: 10px;
        opacity: 0; visibility: hidden; pointer-events: none;
        transform: translateY(2px);
        transition: opacity .16s ease, visibility .16s ease, transform .16s ease;
        z-index: 2147483646;
      }
      .roots-sync-term-box {
        padding: 10px 12px;
        border-radius: 10px; border: 1px solid #334155; background: #0f172a;
        box-shadow: 0 14px 36px rgba(0,0,0,.28);
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 11px; line-height: 1.55; color: #94a3b8; text-align: left;
        pointer-events: auto;
      }
      .roots-sync-wrap:hover .roots-sync-term,
      .roots-sync-wrap.is-open .roots-sync-term,
      .roots-sync-wrap:focus-within .roots-sync-term {
        opacity: 1; visibility: visible; pointer-events: auto; transform: none;
      }
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
      .roots-sync-store-row {
        display: flex; align-items: flex-start; justify-content: space-between;
        gap: 8px; margin: 0;
      }
      .roots-sync-store-label {
        flex: 1; min-width: 0; white-space: pre-wrap; word-break: break-word; color: #7dd3fc;
      }
      .roots-sync-open-btn {
        flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
        min-width: 22px; height: 18px; padding: 0 5px; border-radius: 4px;
        border: 1px solid #334155; background: #1e293b; color: #7dd3fc;
        text-decoration: none; font-size: 11px; line-height: 1;
      }
      .roots-sync-open-btn:hover {
        background: #334155; border-color: #475569; color: #bae6fd;
      }
      .roots-sync-open-btn.is-disabled {
        opacity: .35; cursor: default; pointer-events: none;
      }
    `;
    document.head.appendChild(s);
  }

  function findToolHeaderRight() {
    const adminHeader = document.querySelector('.app-view[data-view-panel="admin"].is-active .admin-topbar .header-right');
    if (adminHeader) return adminHeader;
    return document.querySelector(
      '.sop-header .header-right, .app-topbar .header-right, .app-header .header-right, header[role="banner"] .header-right, .admin-topbar .header-right'
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
    if (/^status\s+operating/i.test(t)) return 'is-ok';
    if (/^status\s+issues/i.test(t)) return 'is-err';
    if (/^status\s+offline/i.test(t) || /^error/i.test(t) || /^code/i.test(t)) return 'is-err';
    if (/^warn/i.test(t) || /^hint/i.test(t)) return 'is-warn';
    if (/^db\s+synced/i.test(t) || /^auth\s+session ok/i.test(t)) return 'is-ok';
    if (/^check\s+.+\s+operating/i.test(t)) return 'is-ok';
    if (/^check\s+.+\s+issues/i.test(t)) return 'is-err';
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
    _panelOpen: false,
    _panelCloseTimer: null,
    _state: { online: null, lines: ['status  initializing…'], lastCheck: null, latencyMs: null },

    bindPanelHover(slot) {
      if (!slot || slot.dataset.panelBound) return;
      slot.dataset.panelBound = '1';
      const open = () => {
        if (this._panelCloseTimer) {
          clearTimeout(this._panelCloseTimer);
          this._panelCloseTimer = null;
        }
        this._panelOpen = true;
        slot.classList.add('is-open');
        this.positionTerminal(slot);
      };
      const scheduleClose = () => {
        if (this._panelCloseTimer) clearTimeout(this._panelCloseTimer);
        this._panelCloseTimer = setTimeout(() => {
          this._panelOpen = false;
          slot.classList.remove('is-open');
          this._panelCloseTimer = null;
        }, 500);
      };
      slot.addEventListener('mouseenter', open);
      slot.addEventListener('mouseleave', scheduleClose);
      slot.addEventListener('focusin', open);
      slot.addEventListener('focusout', (e) => {
        if (slot.contains(e.relatedTarget)) return;
        scheduleClose();
      });
    },

    bindPanelPosition(slot) {
      if (!slot || slot.dataset.posBound) return;
      slot.dataset.posBound = '1';
      const update = () => this.positionTerminal(slot);
      window.addEventListener('scroll', update, true);
      window.addEventListener('resize', update);
      slot.addEventListener('mouseenter', update);
    },

    positionTerminal(slot) {
      const term = slot?.querySelector('.roots-sync-term');
      const pill = slot?.querySelector('.roots-sync-pill');
      if (!term || !pill) return;
      const isOpen = slot.classList.contains('is-open') || slot.matches(':hover');
      if (!isOpen) return;
      const rect = pill.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 24);
      term.style.width = `${width}px`;
      term.style.top = `${Math.max(0, rect.bottom - 10)}px`;
      term.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
      term.style.left = 'auto';
    },

    ensureSlot() {
      hideLegacyProfileHeader();
      let slot = document.getElementById('roots-sync-status');
      const headerRight = findToolHeaderRight();
      if (!headerRight) return slot || null;
      if (!slot) {
        slot = document.createElement('div');
        slot.id = 'roots-sync-status';
        slot.className = 'roots-sync-wrap';
        slot.setAttribute('aria-live', 'polite');
        headerRight.appendChild(slot);
      } else if (slot.parentElement !== headerRight) {
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
      this.bindPanelHover(slot);
      this.bindPanelPosition(slot);
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
      const dbLines = renderStoreRows(meta);
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
          <div class="roots-sync-term-box">
            <div class="roots-sync-term-head">
              <div class="roots-sync-term-title">roots sync monitor</div>
              <button type="button" class="roots-sync-copy-btn" title="Terminal-Inhalt kopieren">Kopieren</button>
            </div>
            ${dbLines}
            <div class="roots-sync-term-line is-dim" aria-hidden="true">&nbsp;</div>
            ${lines}
            <div class="roots-sync-term-line is-dim">checked  ${escapeHtml(stamp)}</div>
          </div>
        </div>`;
      if (this._panelOpen || slot.matches(':hover')) {
        this._panelOpen = true;
        slot.classList.add('is-open');
        if (this._panelCloseTimer) {
          clearTimeout(this._panelCloseTimer);
          this._panelCloseTimer = null;
        }
      }
      requestAnimationFrame(() => this.positionTerminal(slot));
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
      if (this._sb) {
        DataSourceTracker.patchSupabaseClient(
          this._sb,
          supabaseRefFromUrl(this._sb.supabaseUrl || this._sb.rest?.url || '') || SUPABASE_REF,
          this._sb.rest?.headers?.['Accept-Profile'] || 'public'
        );
      }
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

  /**
   * External-link interceptor for iframe context (macOS WKWebView app).
   *
   * Problem: in a WKWebView iframe, clicking target="_blank" links either
   * does nothing or navigates the iframe itself, breaking the app.
   * Solution: capture every external-link click in the iframe, prevent
   * the default, and postMessage the URL to the Intranet parent which opens
   * it via window.open() from the top-level browsing context — which most
   * native macOS apps are configured to forward to the system browser.
   *
   * Covers: https:// http:// mailto: tel: links and any target="_blank".
   * Skips:  #anchors, javascript:, internal-same-page navigation.
   */
  function installLinkInterceptor() {
    if (!IN_TAURI && !IN_IFRAME) return;

    const ctx = IN_TAURI ? '[Tauri-App]' : '[Browser-iframe]';
    console.log(`%c[ROOTS Bridge] ${ctx} Link-Interceptor aktiv`, 'color:#206efb;font-weight:bold');
    console.log(`[ROOTS Bridge] IN_TAURI=${IN_TAURI} | IN_IFRAME=${IN_IFRAME} | __rootsWebkitUiFix=${!!window.__rootsWebkitUiFix}`);

    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      if (!/^(https?:\/\/|mailto:|tel:)/.test(href)) return;

      console.log(`%c[ROOTS Bridge] 🔗 Link-Klick erkannt`, 'color:#206efb;font-weight:bold');
      console.log(`  URL: ${href}`);
      console.log(`  IN_TAURI: ${IN_TAURI} | IN_IFRAME: ${IN_IFRAME}`);

      // stopPropagation: verhindert Opener-Plugin (bubble auf window)
      e.stopPropagation();
      // preventDefault: verhindert Browser-Default (die nach stopPropagation
      // in WKWebView sowieso nicht mehr feuert)
      e.preventDefault();

      // window.open() aus User-Gesture-Kontext (synchron im click handler):
      // → triggert WKWebView createWebViewWith → wry öffnet in Safari ✅
      const result = window.open(href, '_blank', 'noopener,noreferrer');
      console.log(`  window.open() aufgerufen → result: ${result} (null = WKWebView hat übernommen → Safari)`);
      if (result === null) {
        console.log(`  ✅ WKWebView hat createWebViewWith gefeuert → wry öffnet in Safari`);
      } else {
        console.log(`  ⚠️ Neues Fenster geöffnet (result nicht null) — kein WKWebView-Intercept`);
      }
    }, { capture: true });
  }

  /**
   * Universal file-download helper that works both in a normal browser tab
   * and inside an iframe embedded in a macOS web app (WKWebView).
   *
   * In a plain browser tab:  uses the standard <a download> approach.
   * In an iframe (macOS app): blob downloads are blocked by WKWebView; instead
   *   the blob is sent as a transferable ArrayBuffer via postMessage to the
   *   Intranet parent, which triggers the download in the top-level context.
   *
   * Usage (in any ROOTS tool):
   *   window.RootsUserBridge.downloadBlob(blob, 'MyFile.pdf');
   */
  function downloadBlob(blob, filename) {
    if (IN_IFRAME && typeof blob.arrayBuffer === 'function') {
      blob.arrayBuffer().then(buf => {
        window.parent.postMessage(
          { type: 'roots-download-file', filename, mimeType: blob.type || 'application/octet-stream', buffer: buf },
          ORIGIN,
          [buf]   // transfer ownership — zero-copy
        );
      }).catch(() => _directDownload(blob, filename));
      return;
    }
    _directDownload(blob, filename);
  }

  function _directDownload(blob, filename) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
    } catch (_) {}
  }

  window.RootsUserBridge = {
    IN_IFRAME,
    IN_TAURI,
    IN_MAC_APP,
    patch,
    ORIGIN,
    showBridgeToast,
    downloadBlob,
    syncAuthFromParentStorage,
    applyAuthSignOut,
    SyncStatus,
    DataSourceTracker,
    mountSyncStatus: (sb) => SyncStatus.mount(sb),
    VERSION: BRIDGE_VERSION,
  };

  DataSourceTracker.install();
  installLinkInterceptor();  // proxy external links to parent in WKWebView iframe

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
