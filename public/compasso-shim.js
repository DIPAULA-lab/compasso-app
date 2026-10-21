/* =====================================================================
   Compasso · adaptador para rodar fora do claude.ai
   ---------------------------------------------------------------------
   O Compasso original usa duas APIs do runtime de artefatos:
     window.claude.use('db')  → banco de documentos (coleções + docs)
     window.claude.use('mcp') → conectores (Google Calendar, Strava)
   Este arquivo recria as duas com a MESMA interface, então o index.html
   quase não muda. Backends:
     db  → 'server'   (banco SQLite no servidor local: server/compasso.py)
           'local'    (localStorage deste navegador)
           'supabase' (nuvem)
     mcp → Google Calendar via OAuth no navegador; Strava via /api/strava
           (servidor local ou função serverless), que guarda o client_secret.
   Configuração em config.js (window.COMPASSO_CONFIG). Quando o app roda
   pelo servidor local, o próprio servidor gera o config.js.
   ===================================================================== */
(function () {
  'use strict';

  const CFG = Object.assign({
    backend: 'local',
    supabaseUrl: '',
    supabaseAnonKey: '',
    supabasePublishableKey: '',
    authAllowSignup: false,
    authMethod: 'magiclink',
    googleClientId: '',
    googleCalendars: ['primary'],
    stravaEndpoint: '/api/strava',
  }, window.COMPASSO_CONFIG || {});

  const LS = { data: 'compasso:data:v1', gtok: 'compasso:google-token', gok: 'compasso:google-consented', skey: 'compasso:strava-key' };
  const lsGet = (k, f = null) => { try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch { return f; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const fail = (code, message, extra) => Object.assign(new Error(message || code), { code }, extra || {});
  const loadScript = src => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = res; s.onerror = () => rej(fail('server_unavailable', 'Falha ao carregar ' + src));
    document.head.appendChild(s);
  });

  /* ------------------------------------------------------------------
     1. Store em memória + assinaturas (imita onSnapshot)
     ------------------------------------------------------------------ */
  const DB = {};                 // { coleção: { id: dados } }
  const subs = new Set();        // { col, id|null, cb }
  const col = c => DB[c] || (DB[c] = {});
  const resetDB = obj => { Object.keys(DB).forEach(k => delete DB[k]); Object.assign(DB, obj || {}); };

  function fire(s) {
    try {
      if (s.id == null) {
        const m = col(s.col);
        s.cb({ docs: Object.keys(m).map(id => ({ id, exists: true, data: () => clone(m[id]) })), metadata: { fromCache: false } });
      } else {
        const d = col(s.col)[s.id];
        s.cb({ id: s.id, exists: d !== undefined, data: () => clone(d) });
      }
    } catch (e) { console.error('[compasso] listener', e); }
  }
  const notify = (c, id) => subs.forEach(s => { if (s.col === c && (s.id == null || s.id === id)) fire(s); });
  const notifyAll = () => subs.forEach(fire);

  /* ------------------------------------------------------------------
     2. Backends de dados
     ------------------------------------------------------------------ */
  const Local = {
    name: 'local',
    async init() {
      resetDB(lsGet(LS.data, {}));
      // outra aba alterou os dados → recarrega
      window.addEventListener('storage', e => { if (e.key === LS.data) { resetDB(lsGet(LS.data, {})); notifyAll(); } });
    },
    persist() { if (!lsSet(LS.data, DB)) throw fail('quota_exceeded', 'Armazenamento do navegador cheio'); },
    async write() { this.persist(); },
    async writeMany() { this.persist(); },
    user: () => null,
  };

  const Installation = {
    cookie: '__Host-compasso-install',
    standalone: () => !!navigator.standalone || matchMedia('(display-mode: standalone)').matches,
    read() {
      const entry=document.cookie.split('; ').find(s=>s.startsWith(this.cookie+'='));
      try{return entry?decodeURIComponent(entry.slice(this.cookie.length+1)):'';}catch{return '';}
    },
    clear() {document.cookie=this.cookie+'=; Path=/; Max-Age=0; Secure; SameSite=Strict';},
    async request(path,data,authenticated=false) {
      const headers={apikey:CFG.supabasePublishableKey||CFG.supabaseAnonKey,'Content-Type':'application/json'};
      if(authenticated) {
        const {data:{session},error}=await Supa.sb.auth.getSession();
        if(error||!session)throw fail('not_authenticated','Entre novamente no Compasso.');
        headers.Authorization='Bearer '+session.access_token;
      }
      let response;
      try{response=await fetch(CFG.installationEndpoint+path,{method:'POST',cache:'no-store',headers,body:JSON.stringify(data)});}
      catch{throw fail('server_unavailable','Não foi possível conectar para retomar o acesso. Confira sua internet e tente novamente.');}
      let result={};try{result=await response.json()}catch{}
      if(!response.ok)throw fail(result.code||'server_unavailable',result.message||'Não foi possível preparar o acesso.');
      return result;
    },
    async resume(client) {
      if(!CFG.installationEndpoint||!this.standalone())return null;
      const ticket=this.read();if(!/^[a-f0-9]{64}$/.test(ticket))return null;
      let result;
      try{result=await this.request('/consume',{ticket});}
      catch(e){if(e.code==='install_expired'||e.code==='not_granted'){this.clear();return null;}throw e;}
      const {data,error}=await client.auth.verifyOtp({type:'magiclink',token_hash:result.tokenHash});
      this.clear();
      if(error||!data.session)throw fail('not_authenticated','Não foi possível concluir a instalação. Prepare o acesso novamente no Safari.');
      return data.session;
    },
    async prepare() {
      if(this.standalone()||location.protocol!=='https:'||!CFG.installationEndpoint)return;
      const result=await this.request('/issue',{ticket:this.read()},true);
      const ttl=Math.max(0,Math.min(600,Math.floor((Date.parse(result.expiresAt)-Date.now())/1000)));
      document.cookie=this.cookie+'='+encodeURIComponent(result.ticket)+'; Path=/; Max-Age='+ttl+'; Secure; SameSite=Strict';
      if(this.read()!==result.ticket)throw fail('storage_unavailable','Permita os cookies do Compasso no Safari para manter o acesso ao instalar.');
    },
  };

  const Supa = {
    name: 'supabase', sb: null, session: null, ready: false, pending: new Map(),
    async init() {
      const key = CFG.supabasePublishableKey || CFG.supabaseAnonKey;
      if (!CFG.supabaseUrl || !key) throw fail('not_configured', 'Configure a URL e a chave pública do Supabase.');
      await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js');
      this.sb = window.supabase.createClient(CFG.supabaseUrl, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      let { data: { session }, error } = await this.sb.auth.getSession();
      if (error) throw fail('server_unavailable','Não foi possível retomar sua sessão. Confira a conexão e tente novamente.');
      if (!session) session = await Installation.resume(this.sb);
      if (!session) session = await loginOverlay(this.sb);
      const { data: { user }, error: userError } = await this.sb.auth.getUser();
      if (userError || !user || user.id !== session.user.id) throw fail('not_authenticated', 'Sua sessão expirou. Recarregue a página para entrar novamente.');
      this.session = session;
      this.sb.auth.onAuthStateChange((event, next) => {
        if (event === 'SIGNED_OUT' || (next && next.user.id !== this.session.user.id)) {
          resetDB({}); notifyAll(); location.reload(); return;
        }
        if (next) this.session = next;
      });
      await waitForAccess(this.sb, user.id);
      await this.pull();
      const me = session.user.id;
      this.sb.channel('compasso-docs-' + me)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, p => {
          const r = p.eventType === 'DELETE' ? p.old : p.new;
          if (!r || !r.collection || !r.id || r.user_id !== me) return;
          if(this.pending.has(r.collection+'\u0000'+r.id))return;
          if (p.eventType === 'DELETE') delete col(r.collection)[r.id]; else col(r.collection)[r.id] = p.new.data;
          notify(r.collection, r.id);
        })
        .subscribe(status => { if (status === 'SUBSCRIBED') this.resync(); });
      this.ready = true;
      Installation.prepare().catch(() => {});
      if (CFG.cloudEndpoint) Cloud.init().catch(() => {});
      // a conexão em tempo real cai quando a aba dorme; ao voltar, puxa tudo de novo
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.resync();
      });
      window.addEventListener('online', () => this.resync());
    },
    resync() { if (this.ready) this.pull().then(notifyAll).catch(() => {}); },
    async pull() {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await this.sb.from('docs').select('collection,id,data')
          .eq('user_id', this.session.user.id).order('collection').order('id').range(from, from + 999);
        if (error) throw fail('server_unavailable', error.message);
        rows.push(...data);
        if (data.length < 1000) break;
      }
      const next = {};
      rows.forEach(r => { (next[r.collection] = next[r.collection] || {})[r.id] = r.data; });
      this.pending.forEach(({c,id,data})=>{if(data===null)delete (next[c]||{})[id];else(next[c]??={})[id]=clone(data)});
      resetDB(next);
    },
    async write(c, id, data) {
      const pendingKey=c+'\u0000'+id,tag={};this.pending.set(pendingKey,{c,id,data:clone(data),tag});
      try {
      const user_id = this.session.user.id;
      const q = data === null
        ? this.sb.from('docs').delete().match({ user_id, collection: c, id })
        : this.sb.from('docs').upsert({ user_id, collection: c, id, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id,collection,id' });
      const { error } = await q;
      if (error) throw fail(/quota|limit/i.test(error.message) ? 'quota_exceeded' : 'server_unavailable', error.message);
      } finally {if(this.pending.get(pendingKey)?.tag===tag)this.pending.delete(pendingKey);}
    },
    async writeMany(list) {
      const user_id = this.session.user.id, now = new Date().toISOString();
      for (let i = 0; i < list.length; i += 500) {
        const rows = list.slice(i, i + 500).map(([c, id, data]) => ({ user_id, collection: c, id, data, updated_at: now }));
        const { error } = await this.sb.from('docs').upsert(rows, { onConflict: 'user_id,collection,id' });
        if (error) throw fail('server_unavailable', error.message);
      }
    },
    user() { return this.session && this.session.user ? this.session.user.email : null; },
    async signOut() {
      const ticket=Installation.read();
      if(ticket&&CFG.installationEndpoint)await Installation.request('/revoke',{ticket},true);
      Installation.clear();
      if (CFG.cloudEndpoint) await Cloud.disablePush();
      const { error } = await this.sb.auth.signOut({ scope: 'local' }); if (error) throw error; resetDB({}); location.reload();
    },
  };

  const Server = {
    name: 'server', online: false, info: null, ready: false, es: null,
    client: Math.random().toString(36).slice(2) + Date.now().toString(36),
    async init() {
      this.listen();
      await this.pull();
      this.ready = true;
      this.setOnline(true);
      this.loadInfo().catch(() => {});
      // aba volta do segundo plano → garante que nada ficou para trás
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.resync();
      });
    },
    setOnline(v) {
      if (this.online === v) return;
      this.online = v;
      window.dispatchEvent(new Event('compasso:status'));
    },
    async req(method, path, body) {
      const headers = { 'X-Compasso': '1', 'X-Compasso-Client': this.client };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      let r;
      try { r = await fetch('/api' + path, { method, headers, cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) }); }
      catch (e) { this.setOnline(false); throw fail('server_unavailable', 'O servidor do Compasso não está rodando neste computador.'); }
      this.setOnline(true);
      let j = null; try { j = await r.json(); } catch {}
      if (!r.ok) throw fail((j && j.code) || 'server_unavailable', (j && j.message) || 'HTTP ' + r.status);
      return j;
    },
    pending: new Map(),   // gravações ainda sem resposta: sobrevivem a um pull que chegue no meio
    async pull() {
      const j = await this.req('GET', '/db');
      resetDB(j.collections);
      this.pending.forEach(({ c, id, data }) => { if (data === null) delete col(c)[id]; else col(c)[id] = clone(data); });
    },
    resync() { if (this.ready) this.pull().then(notifyAll).catch(() => {}); },
    async loadInfo() { this.info = await this.req('GET', '/settings'); return this.info; },
    // alterações feitas em outras abas/janelas chegam por aqui
    listen() {
      const es = this.es = new EventSource('/api/events');
      es.onopen = () => { this.setOnline(true); this.resync(); };   // reconexão: puxa tudo de novo
      es.onerror = () => { if (es.readyState !== EventSource.OPEN) this.setOnline(false); };
      es.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.src === this.client) return;
        if (m.type === 'put') { col(m.col)[m.id] = m.data; notify(m.col, m.id); }
        else if (m.type === 'del') { delete col(m.col)[m.id]; notify(m.col, m.id); }
        else if (m.type === 'reload') this.resync();
      };
    },
    path: (c, id) => `/db/${encodeURIComponent(c)}/${encodeURIComponent(id)}`,
    async write(c, id, data) {
      const k = c + '\u0000' + id, tag = {};
      this.pending.set(k, { c, id, data: clone(data), tag });
      try { return await (data === null ? this.req('DELETE', this.path(c, id)) : this.req('PUT', this.path(c, id), { data })); }
      finally { if ((this.pending.get(k) || {}).tag === tag) this.pending.delete(k); }
    },
    writeMany(list) { return this.req('POST', '/db/batch', { items: list }); },
    user: () => null,
  };

  const backend = CFG.backend === 'server' ? Server : CFG.backend === 'supabase' ? Supa : Local;

  async function write(c, id, data) {
    if (data === null) delete col(c)[id]; else col(c)[id] = clone(data);
    notify(c, id);
    await backend.write(c, id, data);
  }

  const dbApi = {
    collection(c) {
      return {
        onSnapshot(cb) { const s = { col: c, id: null, cb }; subs.add(s); queueMicrotask(() => fire(s)); return () => subs.delete(s); },
      };
    },
    doc(path) {
      const i = path.indexOf('/'); const c = path.slice(0, i), id = path.slice(i + 1);
      return {
        set: data => write(c, id, data),
        delete: () => write(c, id, null),
        get: async () => ({ id, exists: col(c)[id] !== undefined, data: () => clone(col(c)[id]) }),
        onSnapshot(cb) { const s = { col: c, id, cb }; subs.add(s); queueMicrotask(() => fire(s)); return () => subs.delete(s); },
      };
    },
  };

  const dbReady = backend.init().then(() => dbApi).catch(e => {
    console.error('[compasso] dados', e);
    if (backend === Server) fatal('Servidor do Compasso fora do ar', (e.message || String(e)) + ' Inicie o servidor (README, "Ligar e desligar") e recarregue a página.', true);
    else fatal('Não foi possível abrir os dados', e.message || String(e), true);
    throw e;
  });

  /* ------------------------------------------------------------------
     3. Google Calendar (OAuth no navegador, somente leitura)
     ------------------------------------------------------------------ */
  const Google = {
    tok: lsGet(LS.gtok), client: null, pending: null, watchers: new Set(),
    configured: () => !!CFG.googleClientId,
    connected() { return !!(this.tok && this.tok.exp > Date.now() + 60000); },
    async preload() {
      if (!this.configured()) return;
      try {
        if (!(window.google && google.accounts && google.accounts.oauth2)) await loadScript('https://accounts.google.com/gsi/client');
        this.client = google.accounts.oauth2.initTokenClient({
          client_id: CFG.googleClientId,
          scope: 'https://www.googleapis.com/auth/calendar.readonly',
          callback: r => this.onToken(r),
          error_callback: e => { const p = this.pending; this.pending = null; p && p.rej(fail('needs_reauth', 'Login do Google cancelado (' + (e && e.type || 'popup') + ')')); },
        });
      } catch (e) { console.warn('[compasso] Google', e); }
    },
    onToken(r) {
      const p = this.pending; this.pending = null;
      if (r.error) { p && p.rej(fail('needs_reauth', r.error_description || r.error)); return; }
      this.tok = { t: r.access_token, exp: Date.now() + (+r.expires_in || 3600) * 1000 };
      lsSet(LS.gtok, this.tok); lsSet(LS.gok, 1);
      this.watchers.forEach(w => w.run());
      p && p.res();
    },
    // precisa ser chamado direto de um clique (o navegador bloqueia popups fora de gesto)
    connect() {
      if (!this.configured()) return Promise.reject(fail('not_configured', 'Preencha googleClientId em config.js.'));
      if (!this.client) return Promise.reject(fail('server_unavailable', 'Script do Google ainda não carregou. Tente de novo em instantes.'));
      return new Promise((res, rej) => {
        this.pending = { res, rej };
        this.client.requestAccessToken({ prompt: lsGet(LS.gok) ? '' : 'consent' });
      });
    },
    async list(input) {
      if (!this.configured()) throw fail('not_configured', 'Google Calendar não configurado');
      if (!this.connected()) throw fail('needs_reauth', 'Sessão do Google expirada');
      const out = [];
      for (const cal of CFG.googleCalendars) {
        let pageToken = '';
        do {
          const q = new URLSearchParams({ timeMin: input.startTime, timeMax: input.endTime, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
          if (pageToken) q.set('pageToken', pageToken);
          const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events?${q}`, { headers: { Authorization: 'Bearer ' + this.tok.t } });
          if (r.status === 401) { this.tok = null; lsSet(LS.gtok, null); throw fail('needs_reauth', 'Sessão do Google expirada'); }
          if (r.status === 429 || r.status >= 500) throw fail('server_unavailable', 'HTTP ' + r.status, { retryable: true, retryAfterMs: 4000 });
          if (!r.ok) throw fail('tool_error', 'HTTP ' + r.status + ' na agenda ' + cal);
          const j = await r.json();
          (j.items || []).forEach(e => out.push({
            id: cal === 'primary' ? e.id : cal + ':' + e.id,
            summary: e.summary, htmlLink: e.htmlLink, status: e.status,
            conferenceUrl: e.hangoutLink || ((e.conferenceData && e.conferenceData.entryPoints || []).find(p => p.entryPointType === 'video') || {}).uri || '',
            start: e.start, end: e.end,
          }));
          pageToken = j.nextPageToken || '';
        } while (pageToken);
      }
      return out;
    },
  };
  Google.preload();

  /* ------------------------------------------------------------------
     4. Strava (via função serverless que guarda o client_secret)
     ------------------------------------------------------------------ */
  const Strava = {
    key: () => lsGet(LS.skey, ''),
    setKey: k => lsSet(LS.skey, k ? String(k).trim() : null),
    async headers() {
      const h = {};
      if (backend === Server) { h['X-Compasso'] = '1'; return h; }   // segredos ficam no servidor local
      if (backend === Supa && Supa.sb) {
        const { data: { session } } = await Supa.sb.auth.getSession();
        if (session) h.Authorization = 'Bearer ' + session.access_token;
      }
      if (this.key()) h['X-Compasso-Key'] = this.key();
      return h;
    },
    async list(input) {
      if (!CFG.stravaEndpoint) throw fail('not_configured', 'Strava não configurado');
      const h = await this.headers();
      if (!h.Authorization && !h['X-Compasso-Key'] && !h['X-Compasso']) throw fail('not_configured', 'Strava sem credencial');
      let r;
      try { r = await fetch(CFG.stravaEndpoint + '?first=' + encodeURIComponent((input && input.first) || 60), { headers: h }); }
      catch (e) { throw fail('server_unavailable', 'Função do Strava inacessível'); }
      let j = null; try { j = await r.json(); } catch {}
      if (r.status === 404 && !(j && j.code)) throw fail('not_configured', 'Função do Strava não encontrada neste endereço');
      if (r.status === 401 || r.status === 403) throw fail('needs_reauth', (j && j.message) || 'Credencial recusada pela função');
      if (!r.ok) throw fail((j && j.code) || 'server_unavailable', (j && j.message) || 'HTTP ' + r.status);
      return { payload: j };
    },
  };

  /* ------------------------------------------------------------------
     5. API "mcp" com a mesma forma do runtime do claude.ai
     ------------------------------------------------------------------ */
  const asErr = e => ({ code: e.code || 'tool_error', message: e.message, retryable: !!e.retryable, retryAfterMs: e.retryAfterMs });
  const mcpApi = {
    async callTool(server, tool, input) {
      if (server === 'Strava' && tool === 'list_activities') return Strava.list(input);
      throw fail('not_in_manifest', `${server}/${tool} não existe no modo local`);
    },
    watchTool(server, tool, input, cb, opts) {
      if (!(server === 'Google Calendar' && tool === 'list_events')) {
        queueMicrotask(() => cb({ type: 'error', error: { code: 'not_in_manifest', message: `${server}/${tool}` } }));
        return () => {};
      }
      const w = {
        run: async () => {
          try { const events = await Google.list(input); cb({ type: 'data', result: { payload: { events }, cache: { storedAt: Date.now() } } }); }
          catch (e) { cb({ type: 'error', error: asErr(e) }); }
        },
      };
      Google.watchers.add(w); w.run();
      const iv = setInterval(w.run, (opts && opts.refetchInterval) || 300000);
      return () => { clearInterval(iv); Google.watchers.delete(w); };
    },
  };

  window.claude = {
    use(name) {
      if (name === 'db') return dbReady;
      if (name === 'mcp') return Promise.resolve(mcpApi);
      return Promise.reject(fail('not_granted', name));
    },
  };

  /* ------------------------------------------------------------------
     6. Backup (exportar / importar) e API para a tela de Ajustes
     ------------------------------------------------------------------ */
  function exportData() { return { app: 'compasso', version: 1, exportedAt: new Date().toISOString(), collections: clone(DB) }; }
  function download() {
    const blob = new Blob([JSON.stringify(exportData(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `compasso-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function importData(obj) {
    const cols = obj && obj.collections;
    if (!cols || typeof cols !== 'object') throw fail('invalid_argument', 'Este arquivo não é um backup do Compasso.');
    await dbReady;
    const list = [];
    Object.entries(cols).forEach(([c, docs]) => Object.entries(docs || {}).forEach(([id, d]) => list.push([c, id, d])));
    list.forEach(([c, id, d]) => { col(c)[id] = clone(d); });   // mescla: mesmo id é sobrescrito, o resto fica
    await backend.writeMany(list);
    notifyAll();
    return list.length;
  }

  // A conexão na nuvem pertence à conta; a permissão de push pertence ao aparelho.
  const Cloud = {
    info: null, registration: null, subscription: null, error: '',
    async request(path, method = 'GET', data) {
      const {data:{session},error} = await Supa.sb.auth.getSession();
      if(error||!session)throw fail('not_authenticated','Entre novamente no Compasso.');
      let response;
      try { response = await fetch(CFG.cloudEndpoint + path, {
        method, cache:'no-store', headers:{Authorization:'Bearer '+session.access_token,apikey:CFG.supabasePublishableKey||CFG.supabaseAnonKey,'Content-Type':'application/json'},
        body:data===undefined?undefined:JSON.stringify(data),
      }); } catch { throw fail('server_unavailable','Não foi possível conectar. Confira sua internet.'); }
      let result={};try{result=await response.json()}catch{}
      if(!response.ok)throw fail(result.code||'server_unavailable',result.message||'Serviço temporariamente indisponível.');
      return result;
    },
    changed() { window.dispatchEvent(new Event('compasso:cloud')); },
    prepareInstallation: () => Installation.prepare(),
    supported() { return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; },
    needsInstall() { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(navigator.standalone || matchMedia('(display-mode: standalone)').matches); },
    async init() {
      if('serviceWorker' in navigator && window.isSecureContext) {
        try {
          this.registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
          await navigator.serviceWorker.ready;
          this.subscription=await this.registration.pushManager?.getSubscription();
        }catch{}
      }
      await this.refresh();
      if(this.subscription&&Notification.permission==='granted') await this.registerSubscription(this.subscription);
      document.addEventListener('visibilitychange',()=>{
        if(document.visibilityState==='visible')this.refresh().catch(()=>{});
      });
    },
    async refresh() {
      try {this.info=await this.request('/status');this.error='';}
      catch(e){this.error=e.message;throw e;}
      finally{this.changed();}
      return this.info;
    },
    async registerSubscription(subscription) {
      const ios=/iPad|iPhone|iPod/.test(navigator.userAgent);
      await this.request('/push/subscribe','POST',{subscription:subscription.toJSON(),appUrl:location.origin+'/',label:ios?'iPhone / iPad':/Mac/.test(navigator.platform)?'Mac':'Computador / celular'});
    },
    async enablePush() {
      if(this.needsInstall())throw fail('install_required','No Safari, use Compartilhar → Adicionar à Tela de Início. Abra o Compasso pelo ícone e ative os avisos.');
      if(!this.supported())throw fail('not_supported','Este navegador não oferece notificações para o Compasso. Use um navegador atualizado.');
      // Solicitação diretamente no clique, antes de qualquer chamada à rede.
      const permission=await Notification.requestPermission();
      if(permission!=='granted')throw fail('not_granted','Permita as notificações do Compasso nos ajustes do navegador ou do aparelho.');
      if(!this.registration)this.registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
      await navigator.serviceWorker.ready;
      if(!this.info)await this.refresh();
      const key=this.info.vapidPublicKey;
      const raw=Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
      const subscription=await this.registration.pushManager.getSubscription()||await this.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:raw});
      await this.registerSubscription(subscription);this.subscription=subscription;this.changed();
    },
    async disablePush() {
      const registration=this.registration||await navigator.serviceWorker?.getRegistration();
      const subscription=this.subscription||await registration?.pushManager?.getSubscription();
      if(subscription) {
        await this.request('/push/unsubscribe','POST',{endpoint:subscription.endpoint});
        await subscription.unsubscribe();
      }
      this.subscription=null;this.changed();
    },
    async testPush() {
      if(!this.subscription)throw fail('not_configured','Ative as notificações neste aparelho primeiro.');
      return this.request('/push/test','POST',{endpoint:this.subscription.endpoint});
    },
    async authorizeStrava() {
      const result=await this.request('/strava/authorize','POST',{returnUrl:location.origin+location.pathname});
      location.assign(result.url);
    },
    async disconnectStrava() {await this.request('/strava/disconnect','POST',{});await this.refresh();},
  };

  // Ajustes → Conexões, no modo servidor local
  const serverApi = {
    info: () => Server.info,
    refresh: () => Server.loadInfo(),
    async saveGoogle(clientId, calendars) {
      clientId = String(clientId || '').trim();
      calendars = (calendars || []).map(s => String(s).trim()).filter(Boolean);
      if (!calendars.length) calendars = ['primary'];
      const same = clientId === CFG.googleClientId && JSON.stringify(calendars) === JSON.stringify(CFG.googleCalendars);
      if (same) return false;
      await Server.req('PUT', '/settings/google', { clientId, calendars });
      if (clientId !== CFG.googleClientId) {   // outro cliente OAuth: o token antigo não vale
        Google.tok = null; Google.client = null; lsSet(LS.gtok, null); lsSet(LS.gok, null);
        CFG.googleClientId = clientId;
        await Google.preload();
      }
      CFG.googleCalendars = calendars;
      Google.watchers.forEach(w => w.run());
      await Server.loadInfo();
      return true;
    },
    async saveStrava(clientId, clientSecret) {
      await Server.req('PUT', '/settings/strava', { clientId: String(clientId || '').trim(), clientSecret: String(clientSecret || '').trim() });
      return Server.loadInfo();
    },
    authorizeStrava() { location.href = '/api/strava/authorize'; },
    async disconnectStrava() { await Server.req('POST', '/strava/disconnect'); return Server.loadInfo(); },
    async backupNow() { const j = await Server.req('POST', '/backup'); Server.info = j.settings; return j.file; },
    reveal: () => Server.req('POST', '/reveal'),
  };

  window.CompassoLocal = {
    backend: backend.name,
    online: () => backend !== Server || Server.online,
    server: backend === Server ? serverApi : null,
    cloud: backend === Supa && CFG.cloudEndpoint ? Cloud : null,
    user: () => backend.user(),
    signOut: () => backend.signOut && backend.signOut(),
    download,
    importFile: async file => importData(JSON.parse(await file.text())),
    google: { enabled: () => CFG.googleEnabled !== false, configured: () => Google.configured(), connected: () => Google.connected(), connect: () => Google.connect() },
    strava: {
      configured: () => !!CFG.stravaEndpoint,
      viaLogin: () => backend === Supa,
      hasKey: () => !!Strava.key(),
      setKey: k => Strava.setKey(k),
    },
  };

  /* ------------------------------------------------------------------
     7. Telas auxiliares (login do Supabase, erro fatal)
     ------------------------------------------------------------------ */
  function overlay(html) {
    const o = document.createElement('div');
    o.setAttribute('style', 'position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:16px;background:var(--bg,#F2F2F7)');
    o.innerHTML = `<div style="width:min(420px,100%);background:var(--surface,#fff);border-radius:28px;padding:28px;box-shadow:var(--shadow);font:15px/1.45 var(--f-body,system-ui)">${html}</div>`;
    document.body.appendChild(o);
    return o;
  }
  function fatal(title, msg, retry) {
    const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const o = overlay(`<h2 style="margin:0 0 10px;font-size:22px">${esc(title)}</h2><p style="margin:0 0 14px;color:var(--ink-2)">${esc(msg)}</p>
      ${retry ? '<button class="btn primary" type="button" style="justify-content:center;padding:10px;width:100%">Tentar de novo</button>'
              : '<p style="margin:0;color:var(--ink-3);font-size:13px">Confira o config.js e o README (etapa correspondente). Depois recarregue a página.</p>'}`);
    const b = o.querySelector('button'); if (b) b.addEventListener('click', () => location.reload());
  }
  function loginOverlay(sb) {
    return new Promise(resolve => {
      const otp = CFG.authMethod === 'otp';
      const requestName = otp ? 'código' : 'link de acesso';
      const o = overlay(`
        <div class="brand" style="margin-bottom:24px"><img src="logo.svg" alt="Compasso" style="width:150px;height:auto"></div>
        <h2 style="margin:0 0 6px;font-size:24px;letter-spacing:-.03em">Entrar no Compasso</h2>
        <p style="margin:0 0 20px;color:var(--ink-3);font-size:14px">Acesse suas tarefas, hábitos e treinos em todos os seus dispositivos. Enviaremos um ${requestName} para o seu e-mail.</p>
        <form id="lg-f" style="display:flex;flex-direction:column;gap:10px">
          <label for="lg-e">E-mail</label>
          <input id="lg-e" type="email" required placeholder="seu@email.com" autocomplete="email" autocapitalize="none" spellcheck="false">
          <button class="btn primary" type="submit" style="justify-content:center;padding:10px">Enviar ${requestName}</button>
        </form>
        <form id="lg-c" hidden style="display:flex;flex-direction:column;gap:10px;margin-top:14px">
          <label for="lg-t">Código do e-mail</label>
          <input id="lg-t" type="text" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" placeholder="Digite o código recebido" maxlength="10">
          <button class="btn primary" type="submit" style="justify-content:center;padding:10px">Entrar</button>
        </form>
        <button class="btn ghost" id="lg-change" hidden type="button" style="justify-content:center;margin-top:12px;width:100%">Trocar e-mail</button>
        ${otp?'':`<details style="margin-top:16px;font-size:13px"><summary>Entrar com o link recebido no e-mail</summary><p style="color:var(--ink-3)">Se o link abrir no Safari em vez deste aplicativo, peça um novo link, mantenha-o pressionado no e-mail, escolha Copiar Link e cole aqui sem abri-lo.</p><form id="lg-link-form" style="display:grid;gap:10px"><label for="lg-link">Link de acesso do Compasso</label><input id="lg-link" type="url" required autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Cole aqui o link do e-mail"><button type="submit" class="btn primary">Entrar neste aplicativo</button></form></details>`}
        <p id="lg-m" role="status" aria-live="polite" style="margin:12px 0 0;font-size:13px;color:var(--ink-3)"></p>`);
      const $ = s => o.querySelector(s); const msg = t => { $('#lg-m').textContent = t; };
      let email = '', timer = null, finished = false;
      const send = $('#lg-f button'), enter = $('#lg-c button[type="submit"]');
      const done = session => {
        if (!session || finished) return;
        finished = true; clearInterval(timer); listener.data.subscription.unsubscribe(); o.remove(); resolve(session);
      };
      const listener = sb.auth.onAuthStateChange((_event, session) => { if (session) done(session); });
      const cooldown = () => {
        clearInterval(timer); let remaining = 60; send.disabled = true;
        send.textContent = `Reenviar em ${remaining}s`;
        timer = setInterval(() => {
          remaining--; send.textContent = remaining ? `Reenviar em ${remaining}s` : `Reenviar ${requestName}`;
          if (!remaining) { clearInterval(timer); send.disabled = false; }
        }, 1000);
      };
      $('#lg-f').addEventListener('submit', async ev => {
        ev.preventDefault(); email = $('#lg-e').value.trim(); msg('Enviando…');
        send.disabled = true;
        try {
          const options = { shouldCreateUser: CFG.authAllowSignup === true };
          if (!otp) options.emailRedirectTo = location.origin + location.pathname;
          const { error } = await sb.auth.signInWithOtp({ email, options });
          if (error) {
            if (error.code === 'over_email_send_rate_limit') {
              send.disabled = false;
              return msg('O serviço de e-mail atingiu o limite de envios por hora. Nenhum novo e-mail foi enviado. A liberação pode levar até uma hora; novas tentativas agora não enviam outro link.');
            }
            if (/rate|limit/i.test(error.code || error.message)) { cooldown(); return msg('Aguarde um pouco antes de tentar novamente. Confira também a pasta de spam.'); }
            send.disabled = false;
            return msg(`Não foi possível enviar o ${requestName} para este e-mail. Confira o endereço e tente novamente.`);
          }
          $('#lg-e').readOnly = true; $('#lg-c').hidden = !otp; $('#lg-change').hidden = false;
          if (otp) $('#lg-t').focus();
          cooldown();
          msg(otp ? `Enviamos um código para ${email}. Confira sua caixa de entrada e a pasta de spam.`
            : `Enviamos um link para ${email}. Abra o e-mail e clique no link neste dispositivo para entrar.`);
        } catch { send.disabled = false; msg('Não foi possível conectar. Confira sua internet e tente novamente.'); }
      });
      $('#lg-c').addEventListener('submit', async ev => {
        ev.preventDefault(); msg('Verificando…'); enter.disabled = true;
        try {
          const { data, error } = await sb.auth.verifyOtp({ email, token: $('#lg-t').value.trim(), type: 'email' });
          if (error) { enter.disabled = false; return msg('Esse código está incorreto ou expirou. Confira o e-mail mais recente ou peça um novo código.'); }
          done(data.session);
        } catch { enter.disabled = false; msg('Não foi possível conectar. Confira sua internet e tente novamente.'); }
      });
      $('#lg-change').addEventListener('click', () => {
        $('#lg-e').readOnly = false; $('#lg-c').hidden = true; $('#lg-change').hidden = true; $('#lg-t').value = ''; msg(''); $('#lg-e').focus();
      });
      if(!otp)$('#lg-link-form').addEventListener('submit',async ev=>{
        ev.preventDefault();const button=$('#lg-link-form button');button.disabled=true;msg('Verificando o link…');
        try {
          const url=new URL($('#lg-link').value.trim()),type=url.searchParams.get('type'),token=url.searchParams.get('token')||url.searchParams.get('token_hash');
          if(url.origin!==new URL(CFG.supabaseUrl).origin||url.pathname!=='/auth/v1/verify'||!['magiclink','signup','email'].includes(type)||!token)throw Error('invalid_link');
          const {data,error}=await sb.auth.verifyOtp({token_hash:token,type});
          if(error||!data.session)throw Error('expired_link');
          done(data.session);
        }catch {button.disabled=false;msg('Esse link não é válido ou já foi usado. Peça um novo e copie-o do e-mail sem abrir.');}
      });
      $('#lg-e').focus();
    });
  }
  async function waitForAccess(sb, userId) {
    const allowed = async () => {
      const { data, error } = await sb.from('app_members').select('user_id').eq('user_id', userId).maybeSingle();
      if (error) throw fail('server_unavailable', 'Não foi possível verificar seu acesso. Recarregue a página em instantes.');
      return !!data;
    };
    if (await allowed()) return;
    await new Promise(resolve => {
      const o = overlay('<h2 style="margin-bottom:12px">Conta confirmada</h2><p style="color:var(--ink-3)">Seu acesso está sendo preparado. O Compasso abrirá automaticamente quando seus dados estiverem prontos.</p><button class="btn" type="button">Sair desta conta</button>');
      let checking = false;
      const timer = setInterval(async () => {
        if (checking) return;
        checking = true;
        try { if (await allowed()) { clearInterval(timer); o.remove(); resolve(); } } catch {}
        finally { checking = false; }
      }, 5000);
      o.querySelector('button').addEventListener('click', async () => { await sb.auth.signOut({ scope: 'local' }); location.reload(); });
    });
  }
})();
