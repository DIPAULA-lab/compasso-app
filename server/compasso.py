#!/usr/bin/env python3
"""
Compasso · servidor local
=========================
Serve o app (pasta public/) e guarda os dados num banco SQLite neste computador.
Usa só a biblioteca padrão do Python 3.9+ e roda em macOS, Windows e Linux.

  python3 server/compasso.py                       sobe em http://localhost:8080
  python3 server/compasso.py --open                sobe e abre o navegador
  python3 server/compasso.py --import BACKUP.json  importa um backup e sai
  python3 server/compasso.py --export BACKUP.json  exporta tudo e sai
  python3 server/compasso.py --log servidor.log    grava o registro num arquivo (usado no Windows)

Variáveis de ambiente (opcionais):
  COMPASSO_PORT   porta (padrão 8080)
  COMPASSO_DATA   pasta dos dados (padrão ~/Compasso/dados)

Segurança: escuta só em 127.0.0.1 (nenhuma outra máquina alcança), recusa
qualquer Host que não seja localhost (bloqueia DNS rebinding) e exige o
cabeçalho X-Compasso nas chamadas da API (bloqueia outros sites abertos no
navegador). Segredos do Strava ficam no banco, nunca vão para o navegador.

API (usada pelo compasso-shim.js):
  GET    /api/db                  todos os documentos {coleção: {id: dados}}
  PUT    /api/db/<coleção>/<id>   grava um documento        {"data": ...}
  DELETE /api/db/<coleção>/<id>   apaga um documento
  POST   /api/db/batch            grava vários (importação)  {"items": [[col, id, dados], ...]}
  GET    /api/events              alterações em tempo real (Server-Sent Events)
  GET    /api/settings            estado das conexões e do backup (sem segredos)
  PUT    /api/settings/google     {"clientId", "calendars"}
  PUT    /api/settings/strava     {"clientId", "clientSecret"}
  GET    /api/strava?first=60     atividades, no formato do conector do claude.ai
  GET    /api/strava/authorize    inicia o login no Strava
  GET    /api/strava/callback     volta do Strava
  POST   /api/strava/disconnect
  POST   /api/backup              faz um backup agora
  POST   /api/reveal              abre a pasta de dados no Finder
"""
import argparse
import datetime as dt
import html
import json
import mimetypes
import os
import queue
import re
import secrets
import signal
import sqlite3
import subprocess
import sys
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from email.utils import formatdate
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = '1.0'
PUBLIC = (Path(__file__).resolve().parent.parent / 'public').resolve()
MAX_BODY = 20 * 1024 * 1024
KEEP_DAILY_BACKUPS = 60          # além destes, o primeiro backup de cada mês fica para sempre
STRAVA_MAX_DETAIL = 8            # atividades novas detalhadas (calorias) por sincronização
NAME_RE = re.compile(r'^[^/\x00-\x1f]{1,200}$')
TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
}


def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def log(*args):
    print(time.strftime('%Y-%m-%d %H:%M:%S'), *args, flush=True)


def tilde(p):
    s, home = str(p), str(Path.home())
    return '~' + s[len(home):] if s.startswith(home) else s


class ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def check_name(s, what):
    if not isinstance(s, str) or not NAME_RE.match(s):
        raise ApiError(400, 'invalid_argument', f'{what} inválido')
    return s


# ---------------------------------------------------------------------------
# Banco (SQLite)
# ---------------------------------------------------------------------------
SCHEMA = '''
CREATE TABLE IF NOT EXISTS docs (
  collection TEXT NOT NULL,
  id         TEXT NOT NULL,
  data       TEXT NOT NULL,          -- JSON do documento
  updated_at TEXT NOT NULL,
  PRIMARY KEY (collection, id)
);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,            -- google, strava, strava_calories
  value TEXT NOT NULL                -- JSON
);
'''


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.lock = threading.RLock()
        self.cx = sqlite3.connect(str(self.path), check_same_thread=False, isolation_level=None)
        self.cx.execute('PRAGMA journal_mode=WAL')
        self.cx.execute('PRAGMA synchronous=NORMAL')
        self.cx.execute('PRAGMA busy_timeout=5000')
        self.cx.executescript(SCHEMA)
        os.chmod(self.path, 0o600)

    def all(self):
        with self.lock:
            rows = self.cx.execute('SELECT collection, id, data FROM docs ORDER BY collection, id').fetchall()
        out = {}
        for c, i, d in rows:
            out.setdefault(c, {})[i] = json.loads(d)
        return out

    def count(self):
        with self.lock:
            return self.cx.execute('SELECT COUNT(*) FROM docs').fetchone()[0]

    def write(self, items):
        """items: [(coleção, id, dados | None)]. None apaga. Tudo numa transação só."""
        ts = now_iso()
        with self.lock:
            self.cx.execute('BEGIN IMMEDIATE')
            try:
                for c, i, d in items:
                    if d is None:
                        self.cx.execute('DELETE FROM docs WHERE collection=? AND id=?', (c, i))
                    else:
                        self.cx.execute(
                            'INSERT INTO docs (collection, id, data, updated_at) VALUES (?, ?, ?, ?) '
                            'ON CONFLICT(collection, id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at',
                            (c, i, json.dumps(d, ensure_ascii=False, separators=(',', ':')), ts))
                self.cx.execute('COMMIT')
            except BaseException:
                self.cx.execute('ROLLBACK')
                raise

    def get(self, key, default=None):
        with self.lock:
            r = self.cx.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone()
        return json.loads(r[0]) if r else default

    def set(self, key, value):
        with self.lock:
            if value is None:
                self.cx.execute('DELETE FROM settings WHERE key=?', (key,))
            else:
                self.cx.execute('INSERT INTO settings (key, value) VALUES (?, ?) '
                                'ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                                (key, json.dumps(value, ensure_ascii=False)))

    def close(self):
        with self.lock:
            try:
                self.cx.execute('PRAGMA wal_checkpoint(TRUNCATE)')
            finally:
                self.cx.close()


def export_doc(store):
    return {'app': 'compasso', 'version': 1, 'exportedAt': now_iso(), 'collections': store.all()}


def parse_backup(obj):
    cols = obj.get('collections') if isinstance(obj, dict) else None
    if not isinstance(cols, dict):
        raise ApiError(400, 'invalid_argument', 'Este arquivo não é um backup do Compasso.')
    items = []
    for c, docs in cols.items():
        if not isinstance(docs, dict):
            continue
        for i, d in docs.items():
            if d is not None:
                items.append((check_name(c, 'Coleção'), check_name(i, 'Id'), d))
    return items


# ---------------------------------------------------------------------------
# Backups automáticos (um JSON por dia, no mesmo formato de "Exportar backup")
# ---------------------------------------------------------------------------
class Backups:
    PATTERN = re.compile(r'^compasso-backup-(\d{4}-\d{2})-\d{2}\.json$')

    def __init__(self, store, folder):
        self.store, self.folder = store, Path(folder)

    def files(self):
        if not self.folder.is_dir():
            return []
        return sorted(f for f in self.folder.iterdir() if self.PATTERN.match(f.name))

    def last(self):
        f = self.files()
        return f[-1].name[16:26] if f else None

    def make(self, force=False):
        if self.store.count() == 0:
            return None
        f = self.folder / f'compasso-backup-{dt.date.today().isoformat()}.json'
        if f.exists() and not force:
            return None
        self.folder.mkdir(parents=True, exist_ok=True)
        tmp = f.with_name(f.name + '.tmp')
        tmp.write_text(json.dumps(export_doc(self.store), ensure_ascii=False, indent=1), encoding='utf-8')
        os.chmod(tmp, 0o600)
        os.replace(tmp, f)
        self.prune()
        log('backup salvo:', tilde(f))
        return f

    def prune(self):
        files = self.files()
        first_of_month = {}
        for f in files:
            first_of_month.setdefault(self.PATTERN.match(f.name).group(1), f)
        keep = set(files[-KEEP_DAILY_BACKUPS:]) | set(first_of_month.values())
        for f in files:
            if f not in keep:
                f.unlink()

    def loop(self, stopping):
        while not stopping.is_set():
            try:
                self.make()
            except Exception as e:  # noqa: BLE001 — o servidor continua mesmo se o disco falhar
                log('backup falhou:', repr(e))
            stopping.wait(3600)


# ---------------------------------------------------------------------------
# Tempo real: cada aba aberta recebe as alterações das outras
# ---------------------------------------------------------------------------
class Bus:
    def __init__(self):
        self.subs, self.lock = set(), threading.Lock()

    def subscribe(self):
        q = queue.Queue(maxsize=500)
        with self.lock:
            self.subs.add(q)
        return q

    def unsubscribe(self, q):
        with self.lock:
            self.subs.discard(q)

    def publish(self, msg):
        data = json.dumps(msg, ensure_ascii=False, separators=(',', ':'))
        with self.lock:
            subs = list(self.subs)
        for q in subs:
            try:
                q.put_nowait(data)
            except queue.Full:  # aba travada: descarta a fila e manda recarregar tudo
                with q.mutex:
                    q.queue.clear()
                q.put_nowait('{"type":"reload"}')


# ---------------------------------------------------------------------------
# Strava (OAuth feito aqui; o client_secret nunca sai deste computador)
# ---------------------------------------------------------------------------
def http_json(url, method='GET', form=None, headers=None, timeout=20):
    h = {'Accept': 'application/json', 'User-Agent': 'Compasso-local/' + VERSION}
    h.update(headers or {})
    body = None
    if form is not None:
        body = urllib.parse.urlencode(form).encode()
        h['Content-Type'] = 'application/x-www-form-urlencoded'
    req = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b'null')
        except ValueError:
            return e.code, None
    except (urllib.error.URLError, OSError) as e:
        raise ApiError(502, 'server_unavailable', f'Sem conexão com o Strava ({getattr(e, "reason", e)})')


class Strava:
    OAUTH = 'https://www.strava.com/oauth'
    API = 'https://www.strava.com/api/v3'
    TOKEN_KEYS = ('refresh_token', 'access_token', 'expires_at', 'athlete', 'scope')

    def __init__(self, store):
        self.store = store
        self.lock = threading.Lock()   # uma renovação de token por vez
        self.states = {}               # state do OAuth → validade

    def cfg(self):
        return self.store.get('strava', {}) or {}

    def public(self):
        c = self.cfg()
        return {
            'hasCredentials': bool(c.get('client_id') and c.get('client_secret')),
            'clientId': c.get('client_id', ''),
            'connected': bool(c.get('refresh_token')),
            'athlete': c.get('athlete', ''),
        }

    def save_credentials(self, client_id, client_secret):
        client_id = str(client_id or '').strip()
        client_secret = str(client_secret or '').strip()
        if not re.fullmatch(r'\d{1,12}', client_id):
            raise ApiError(400, 'invalid_argument', 'O Client ID do Strava é um número (ex.: 123456).')
        if client_secret and not re.fullmatch(r'[A-Za-z0-9]{20,100}', client_secret):
            raise ApiError(400, 'invalid_argument', 'Client Secret inválido: copie de novo em strava.com/settings/api.')
        c = self.cfg()
        if client_id != c.get('client_id'):
            if not client_secret:
                raise ApiError(400, 'invalid_argument', 'Informe também o Client Secret.')
            c = {}  # outro app do Strava: tokens antigos não valem
        c['client_id'] = client_id
        if client_secret:
            c['client_secret'] = client_secret
        self.store.set('strava', c)

    def authorize_url(self, origin):
        c = self.cfg()
        if not (c.get('client_id') and c.get('client_secret')):
            raise ApiError(409, 'not_configured', 'Salve o Client ID e o Client Secret em Ajustes → Strava.')
        now = time.time()
        self.states = {s: t for s, t in self.states.items() if t > now}
        state = secrets.token_urlsafe(24)
        self.states[state] = now + 900
        return self.OAUTH + '/authorize?' + urllib.parse.urlencode({
            'client_id': c['client_id'], 'response_type': 'code', 'approval_prompt': 'auto',
            'redirect_uri': origin + '/api/strava/callback', 'scope': 'read,activity:read_all', 'state': state,
        })

    def callback(self, q):
        if self.states.pop(q.get('state', ''), 0) < time.time():
            raise ApiError(400, 'invalid_argument', 'Este link de autorização expirou. Volte ao Compasso e clique em Autorizar de novo.')
        if q.get('error'):
            raise ApiError(400, 'needs_reauth', 'A autorização foi cancelada no Strava.')
        scope = q.get('scope', '')
        if 'activity:read' not in scope:
            raise ApiError(400, 'needs_reauth', 'O Compasso precisa ler suas atividades. Autorize de novo mantendo marcadas as opções de atividades.')
        c = self.cfg()
        status, j = http_json(self.OAUTH + '/token', 'POST', {
            'client_id': c.get('client_id', ''), 'client_secret': c.get('client_secret', ''),
            'code': q.get('code', ''), 'grant_type': 'authorization_code'})
        if status != 200 or not isinstance(j, dict) or not j.get('refresh_token'):
            detail = (j or {}).get('message', '') if isinstance(j, dict) else ''
            raise ApiError(502, 'needs_reauth', f'O Strava recusou a autorização (HTTP {status} {detail}). Confira o Client Secret.')
        a = j.get('athlete') or {}
        c.update(refresh_token=j['refresh_token'], access_token=j.get('access_token', ''),
                 expires_at=j.get('expires_at', 0), scope=scope,
                 athlete=' '.join(x for x in (a.get('firstname'), a.get('lastname')) if x))
        self.store.set('strava', c)
        log('Strava conectado:', c['athlete'] or '(atleta)')

    def token(self):
        with self.lock:
            c = self.cfg()
            if not c.get('refresh_token'):
                raise ApiError(409, 'not_configured', 'Strava não conectado. Abra Ajustes → Strava.')
            if c.get('access_token') and c.get('expires_at', 0) > time.time() + 120:
                return c['access_token']
            status, j = http_json(self.OAUTH + '/token', 'POST', {
                'client_id': c['client_id'], 'client_secret': c['client_secret'],
                'grant_type': 'refresh_token', 'refresh_token': c['refresh_token']})
            if status == 429:
                raise ApiError(429, 'rate_limited', 'Limite da API do Strava atingido; tente em 15 min.')
            if status in (400, 401, 403):
                raise ApiError(502, 'needs_reauth', 'O Strava recusou o acesso. Abra Ajustes → Strava e autorize de novo.')
            if status != 200 or not isinstance(j, dict) or not j.get('access_token'):
                raise ApiError(502, 'server_unavailable', f'Strava HTTP {status}')
            # o Strava pode trocar o refresh token: sempre guardar o mais recente
            c.update(access_token=j['access_token'], refresh_token=j.get('refresh_token') or c['refresh_token'],
                     expires_at=j.get('expires_at', 0))
            self.store.set('strava', c)
            return c['access_token']

    def activities(self, first):
        tok = self.token()

        def api(path):
            return http_json(self.API + path, headers={'Authorization': 'Bearer ' + tok})

        status, lst = api(f'/athlete/activities?per_page={first}')
        if status == 429:
            raise ApiError(429, 'rate_limited', 'Limite da API do Strava atingido; tente em 15 min.')
        if status == 401:
            raise ApiError(502, 'needs_reauth', 'O Strava recusou o acesso. Abra Ajustes → Strava e autorize de novo.')
        if status != 200 or not isinstance(lst, list):
            raise ApiError(502, 'server_unavailable', f'Strava HTTP {status}')

        # a listagem não traz calorias: busca o detalhe de poucas atividades novas por vez e guarda
        cal = self.store.get('strava_calories', {}) or {}
        missing = [a['id'] for a in lst if str(a['id']) not in cal][:STRAVA_MAX_DETAIL]
        if missing:
            def detail(aid):
                try:
                    return api(f'/activities/{aid}')
                except ApiError:
                    return 0, None
            with ThreadPoolExecutor(4) as ex:
                for aid, (st, d) in zip(missing, ex.map(detail, missing)):
                    if st == 200 and isinstance(d, dict):
                        cal[str(aid)] = round(d.get('calories') or 0)
            self.store.set('strava_calories', cal)

        return [{
            'id': a['id'],
            'name': a.get('name'),
            'sport_type': a.get('sport_type') or a.get('type'),
            'start_local': a.get('start_date_local'),
            'summary': {'moving_time': a.get('moving_time'), 'distance': a.get('distance'),
                        'total_calories': cal.get(str(a['id'])) or 0, 'relative_effort': a.get('suffer_score') or 0},
        } for a in lst]

    def disconnect(self):
        try:
            http_json(self.OAUTH + '/deauthorize', 'POST', {'access_token': self.token()}, timeout=8)
        except ApiError:
            pass  # sem internet ou token já revogado: apaga do mesmo jeito
        c = self.cfg()
        for k in self.TOKEN_KEYS:
            c.pop(k, None)
        self.store.set('strava', c)


# ---------------------------------------------------------------------------
# Aplicação
# ---------------------------------------------------------------------------
class App:
    def __init__(self, data_dir, port):
        self.data_dir = Path(data_dir)
        self.port = port
        self.store = Store(self.data_dir / 'compasso.db')
        self.bus = Bus()
        self.strava = Strava(self.store)
        self.backups = Backups(self.store, self.data_dir / 'backups')
        self.stopping = threading.Event()
        self.hosts = {f'localhost:{port}', f'127.0.0.1:{port}', f'[::1]:{port}'}
        self.origins = {'http://' + h for h in self.hosts}

    def config_js(self):
        g = self.store.get('google', {}) or {}
        cfg = {'backend': 'server', 'googleClientId': g.get('clientId', ''),
               'googleCalendars': g.get('calendars') or ['primary'], 'stravaEndpoint': '/api/strava'}
        return ('/* Gerado pelo servidor local do Compasso. Para mudar, use Ajustes → Conexões e dados. */\n'
                'window.COMPASSO_CONFIG = ' + json.dumps(cfg, ensure_ascii=False) + ';\n')

    def settings(self):
        g = self.store.get('google', {}) or {}
        return {
            'version': VERSION,
            'dataDir': tilde(self.data_dir),
            'docs': self.store.count(),
            'backups': {'dir': tilde(self.backups.folder), 'last': self.backups.last(), 'count': len(self.backups.files())},
            'google': {'clientId': g.get('clientId', ''), 'calendars': g.get('calendars') or ['primary']},
            'strava': self.strava.public(),
        }

    def save_google(self, body):
        cid = str(body.get('clientId') or '').strip()
        if cid and not re.fullmatch(r'[\w.-]{5,200}\.apps\.googleusercontent\.com', cid):
            raise ApiError(400, 'invalid_argument', 'O ID do cliente termina em .apps.googleusercontent.com')
        cals = body.get('calendars') or ['primary']
        if not isinstance(cals, list) or len(cals) > 20 or not all(isinstance(c, str) and 0 < len(c.strip()) <= 200 for c in cals):
            raise ApiError(400, 'invalid_argument', 'Lista de agendas inválida')
        self.store.set('google', {'clientId': cid, 'calendars': [c.strip() for c in cals]})

    def reveal(self):
        opener = {'darwin': ['open'], 'win32': ['explorer']}.get(sys.platform, ['xdg-open'])
        subprocess.Popen(opener + [str(self.data_dir)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


class Handler(BaseHTTPRequestHandler):
    server_version = 'Compasso/' + VERSION
    sys_version = ''
    protocol_version = 'HTTP/1.1'
    app = None  # definido em serve()

    def log_message(self, fmt, *args):
        pass  # sem log por requisição; gravações e erros são registrados à parte

    # ---- respostas
    def send(self, status, body=b'', ctype='application/json; charset=utf-8', headers=None):
        if isinstance(body, str):
            body = body.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def json(self, status, obj):
        self.send(status, json.dumps(obj, ensure_ascii=False, separators=(',', ':')), headers={'Cache-Control': 'no-store'})

    def redirect(self, location):
        self.send(302, b'', 'text/plain', {'Location': location, 'Cache-Control': 'no-store'})

    def page(self, status, title, msg):
        self.send(status, (
            '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
            f'<title>Compasso</title><body style="font:16px/1.5 -apple-system,system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 20px">'
            f'<h2>{html.escape(title)}</h2><p>{html.escape(msg)}</p><p><a href="/">Voltar ao Compasso</a></p></body></html>'),
            'text/html; charset=utf-8', {'Cache-Control': 'no-store'})

    def body_json(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > MAX_BODY:
            raise ApiError(413, 'invalid_argument', 'Dados grandes demais')
        raw = self.rfile.read(n) if n else b''
        try:
            return json.loads(raw or b'null')
        except ValueError:
            raise ApiError(400, 'invalid_argument', 'JSON inválido') from None

    # ---- roteamento
    def do_GET(self):
        self.route('GET')

    def do_HEAD(self):
        self.route('HEAD')

    def do_PUT(self):
        self.route('PUT')

    def do_POST(self):
        self.route('POST')

    def do_DELETE(self):
        self.route('DELETE')

    def do_OPTIONS(self):
        self.route('OPTIONS')  # nunca aprova CORS: outros sites não chegam à API

    def route(self, method):
        try:
            url = urllib.parse.urlsplit(self.path)
            if (self.headers.get('Host') or '').lower() not in self.app.hosts:
                raise ApiError(421, 'forbidden', f'Abra pelo endereço http://localhost:{self.app.port}')
            if url.path.startswith('/api/'):
                segs = [urllib.parse.unquote(s) for s in url.path[5:].split('/')]
                self.guard('/'.join(segs), method)
                return self.api(method, segs, dict(urllib.parse.parse_qsl(url.query)))
            if method not in ('GET', 'HEAD'):
                raise ApiError(405, 'invalid_argument', 'Método não permitido')
            return self.static(urllib.parse.unquote(url.path))
        except ApiError as e:
            self.close_connection = True
            if e.status >= 500:
                log('erro', method, self.path.split('?')[0], e.code, e.message)
            self.json(e.status, {'code': e.code, 'message': e.message})
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        except Exception as e:  # noqa: BLE001
            self.close_connection = True
            log('erro interno', method, self.path.split('?')[0], repr(e))
            traceback.print_exc()
            try:
                self.json(500, {'code': 'server_unavailable', 'message': f'Erro interno do servidor: {e}'})
            except OSError:
                pass

    def guard(self, path, method):
        origin = self.headers.get('Origin')
        if origin and origin.lower() not in self.app.origins:
            raise ApiError(403, 'forbidden', 'Origem não permitida')
        if method == 'OPTIONS':
            raise ApiError(403, 'forbidden', 'CORS não permitido')
        if path == 'strava/callback':
            return  # navegação vinda do strava.com; protegida pelo "state"
        if path in ('events', 'strava/authorize'):
            if self.headers.get('Sec-Fetch-Site', 'same-origin') not in ('same-origin', 'none'):
                raise ApiError(403, 'forbidden', 'Origem não permitida')
            return
        if self.headers.get('X-Compasso') != '1':
            raise ApiError(403, 'forbidden', 'Requisição sem o cabeçalho do Compasso')

    def client(self):
        c = self.headers.get('X-Compasso-Client') or ''
        return c[:64]

    def api(self, method, segs, q):
        a = self.app
        path = '/'.join(segs)

        if path == 'db' and method == 'GET':
            return self.json(200, {'collections': a.store.all()})

        if len(segs) == 3 and segs[0] == 'db' and method in ('PUT', 'DELETE'):
            c, i = check_name(segs[1], 'Coleção'), check_name(segs[2], 'Id')
            data = None
            if method == 'PUT':
                body = self.body_json()
                if not isinstance(body, dict) or body.get('data') is None:
                    raise ApiError(400, 'invalid_argument', 'Envie {"data": ...}')
                data = body['data']
            with a.store.lock:  # grava e avisa as outras abas na mesma ordem
                a.store.write([(c, i, data)])
                a.bus.publish({'type': 'put' if data is not None else 'del', 'col': c, 'id': i, 'data': data, 'src': self.client()})
            return self.json(200, {'ok': True})

        if path == 'db/batch' and method == 'POST':
            body = self.body_json()
            raw = body.get('items') if isinstance(body, dict) else None
            if not isinstance(raw, list):
                raise ApiError(400, 'invalid_argument', 'Envie {"items": [[coleção, id, dados], ...]}')
            items = []
            for it in raw:
                if not (isinstance(it, list) and len(it) == 3):
                    raise ApiError(400, 'invalid_argument', 'Item inválido')
                items.append((check_name(it[0], 'Coleção'), check_name(it[1], 'Id'), it[2]))
            with a.store.lock:
                a.store.write(items)
                a.bus.publish({'type': 'reload', 'src': self.client()})
            log(f'{len(items)} registros gravados em lote')
            return self.json(200, {'ok': True, 'count': len(items)})

        if path == 'events' and method == 'GET':
            return self.events()

        if path == 'settings' and method == 'GET':
            return self.json(200, a.settings())

        if path == 'settings/google' and method == 'PUT':
            body = self.body_json()
            a.save_google(body if isinstance(body, dict) else {})
            return self.json(200, a.settings())

        if path == 'settings/strava' and method == 'PUT':
            body = self.body_json() or {}
            a.strava.save_credentials(body.get('clientId'), body.get('clientSecret'))
            return self.json(200, a.settings())

        if path == 'strava' and method == 'GET':
            try:
                first = max(1, min(200, int(q.get('first') or 60)))
            except ValueError:
                first = 60
            return self.json(200, {'activities': a.strava.activities(first)})

        if path == 'strava/authorize' and method == 'GET':
            try:
                return self.redirect(a.strava.authorize_url('http://' + self.headers['Host']))
            except ApiError as e:
                return self.page(e.status, 'Strava não configurado', e.message)

        if path == 'strava/callback' and method == 'GET':
            try:
                a.strava.callback(q)
            except ApiError as e:
                return self.page(e.status, 'Não foi possível conectar o Strava', e.message)
            return self.redirect('/#treinos')

        if path == 'strava/disconnect' and method == 'POST':
            a.strava.disconnect()
            return self.json(200, a.settings())

        if path == 'backup' and method == 'POST':
            f = a.backups.make(force=True)
            return self.json(200, {'ok': True, 'file': tilde(f) if f else None, 'settings': a.settings()})

        if path == 'reveal' and method == 'POST':
            a.reveal()
            return self.json(200, {'ok': True})

        if path == 'health' and method == 'GET':
            return self.json(200, {'ok': True, 'version': VERSION, 'docs': a.store.count()})

        raise ApiError(404, 'not_found', 'Rota inexistente')

    def events(self):
        a = self.app
        q = a.bus.subscribe()
        self.close_connection = True
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(b'retry: 3000\n\n')
            self.wfile.flush()
            while not a.stopping.is_set():
                try:
                    chunk = 'data: ' + q.get(timeout=20) + '\n\n'
                except queue.Empty:
                    chunk = ': ping\n\n'  # mantém a conexão e detecta aba fechada
                self.wfile.write(chunk.encode('utf-8'))
                self.wfile.flush()
        except OSError:
            pass
        finally:
            a.bus.unsubscribe(q)

    def static(self, path):
        if path == '/config.js':
            return self.send(200, self.app.config_js(), TYPES['.js'], {'Cache-Control': 'no-store'})
        if '\x00' in path:
            raise ApiError(400, 'invalid_argument', 'Caminho inválido')
        if path.endswith('/'):
            path += 'index.html'
        f = (PUBLIC / path.lstrip('/')).resolve()
        if PUBLIC not in f.parents or f.name.startswith('.') or not f.is_file():
            return self.page(404, 'Página não encontrada', path)
        lm = formatdate(f.stat().st_mtime, usegmt=True)
        if self.headers.get('If-Modified-Since') == lm:
            self.send_response(304)
            self.send_header('Last-Modified', lm)
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            return None
        ctype = TYPES.get(f.suffix.lower()) or mimetypes.guess_type(f.name)[0] or 'application/octet-stream'
        return self.send(200, f.read_bytes(), ctype, {'Cache-Control': 'no-cache', 'Last-Modified': lm})


# ---------------------------------------------------------------------------
# Linha de comando
# ---------------------------------------------------------------------------
class Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        if isinstance(sys.exc_info()[1], (ConnectionResetError, BrokenPipeError, TimeoutError)):
            return  # aba fechada no meio de uma conexão: normal, não é erro
        super().handle_error(request, client_address)


def serve(app, open_browser):
    Handler.app = app
    try:
        httpd = Server(('127.0.0.1', app.port), Handler)
    except OSError as e:
        if e.errno in (48, 98, 10048):  # EADDRINUSE (macOS, Linux, Windows)
            log(f'A porta {app.port} já está em uso. O Compasso já está rodando? Abra http://localhost:{app.port}')
            sys.exit(1)
        raise

    def stop(*_):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, stop)

    threading.Thread(target=app.backups.loop, args=(app.stopping,), daemon=True).start()
    url = f'http://localhost:{app.port}'
    log(f'Compasso {VERSION} em {url}  ·  dados: {tilde(app.store.path)}  ·  {app.store.count()} registros')
    if open_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        app.stopping.set()
        httpd.server_close()
        app.store.close()
        log('Compasso parado.')


def main():
    ap = argparse.ArgumentParser(description='Servidor local do Compasso')
    ap.add_argument('--port', type=int, default=int(os.environ.get('COMPASSO_PORT') or 8080))
    ap.add_argument('--data', default=os.environ.get('COMPASSO_DATA') or str(Path.home() / 'Compasso' / 'dados'),
                    help='pasta do banco e dos backups (padrão ~/Compasso/dados)')
    ap.add_argument('--open', action='store_true', help='abre o navegador ao iniciar')
    ap.add_argument('--import', dest='imp', metavar='BACKUP.json', help='importa um backup (mescla) e sai')
    ap.add_argument('--export', metavar='BACKUP.json', help='exporta todos os dados e sai')
    ap.add_argument('--log', metavar='ARQUIVO', help='grava o registro neste arquivo (ex.: rodando sem janela no Windows)')
    args = ap.parse_args()

    if args.log:
        Path(args.log).expanduser().parent.mkdir(parents=True, exist_ok=True)
        sys.stdout = sys.stderr = open(Path(args.log).expanduser(), 'a', encoding='utf-8', buffering=1)
    else:
        for stream in (sys.stdout, sys.stderr):
            try:
                stream.reconfigure(errors='replace')  # console do Windows sem UTF-8 não derruba o servidor
            except (AttributeError, ValueError):
                pass

    data = Path(args.data).expanduser().resolve()
    data.mkdir(parents=True, exist_ok=True)
    os.chmod(data, 0o700)
    app = App(data, args.port)

    if args.imp:
        with open(args.imp, encoding='utf-8') as fh:
            items = parse_backup(json.load(fh))
        app.store.write(items)
        app.store.close()
        print(f'{len(items)} registros importados para {tilde(app.store.path)}')
        return
    if args.export:
        out = Path(args.export).expanduser()
        out.write_text(json.dumps(export_doc(app.store), ensure_ascii=False, indent=1), encoding='utf-8')
        os.chmod(out, 0o600)
        app.store.close()
        print(f'Backup salvo em {out}')
        return
    serve(app, args.open)


if __name__ == '__main__':
    main()
