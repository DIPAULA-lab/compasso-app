#!/bin/bash
# Compasso no macOS: instala o servidor local como serviço (liga sozinho no login) e controla.
#
#   ./scripts/compasso-mac.sh instalar [BACKUP.json]   copia o app para ~/Compasso e liga o serviço
#   ./scripts/compasso-mac.sh status                   está rodando?
#   ./scripts/compasso-mac.sh abrir                    abre no navegador
#   ./scripts/compasso-mac.sh parar | iniciar | reiniciar
#   ./scripts/compasso-mac.sh log                      acompanha o registro do servidor
#   ./scripts/compasso-mac.sh desinstalar              desliga o serviço (os dados ficam)
#
# Onde fica cada coisa:
#   ~/Compasso/app      código do app (substituído a cada "instalar")
#   ~/Compasso/dados    banco compasso.db e backups/  ← seus dados
#   ~/Compasso/logs     servidor.log
set -euo pipefail

PORT="${COMPASSO_PORT:-8080}"
BASE="$HOME/Compasso"
APP="$BASE/app"
DATA="$BASE/dados"
LOGS="$BASE/logs"
LABEL="local.compasso.servidor"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY=/usr/bin/python3
URL="http://localhost:$PORT"

say() { printf '%s\n' "$*"; }
up() { curl -fsS -m 2 -H 'X-Compasso: 1' "$URL/api/health" 2>/dev/null; }
wait_up() { for _ in $(seq 1 40); do up >/dev/null && return 0; sleep 0.25; done; return 1; }
loaded() { launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; }
fail_log() { say "O servidor não respondeu em $URL. Últimas linhas de $LOGS/servidor.log:"; tail -n 15 "$LOGS/servidor.log" 2>/dev/null || true; exit 1; }

write_plist() {
  mkdir -p "$(dirname "$PLIST")"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PY</string>
    <string>$APP/server/compasso.py</string>
    <string>--port</string><string>$PORT</string>
    <string>--data</string><string>$DATA</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOGS/servidor.log</string>
  <key>StandardErrorPath</key><string>$LOGS/servidor.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PYTHONUNBUFFERED</key><string>1</string>
    <key>PYTHONDONTWRITEBYTECODE</key><string>1</string>
  </dict>
</dict>
</plist>
EOF
}

case "${1:-}" in
  instalar)
    backup="${2:-}"
    [ -f "$SRC/server/compasso.py" ] || { say "Não achei server/compasso.py em $SRC."; exit 1; }
    if ! xcode-select -p >/dev/null 2>&1; then
      say "O Compasso usa o Python que vem nas ferramentas de linha de comando da Apple, e elas ainda não estão neste Mac."
      say "Vai abrir uma janela da Apple pedindo para instalar: clique em Instalar, espere terminar e rode o instalador do Compasso de novo."
      xcode-select --install >/dev/null 2>&1 || true
      exit 1
    fi
    "$PY" -c 'import sys; sys.exit(sys.version_info < (3, 9))' || { say "O Compasso precisa do Python 3.9 ou mais novo ($PY). Atualize as ferramentas da Apple em Ajustes do Sistema → Geral → Atualização de Software."; exit 1; }
    if [ -n "$backup" ] && [ ! -f "$backup" ]; then say "Backup não encontrado: $backup"; exit 1; fi

    mkdir -p "$APP" "$DATA" "$LOGS"
    chmod 700 "$BASE" "$DATA"
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true

    if [ "$SRC" != "$APP" ]; then
      for d in public server scripts; do
        rsync -a --delete --exclude '__pycache__' --exclude '.DS_Store' "$SRC/$d/" "$APP/$d/"
      done
      cp "$SRC/README.md" "$APP/README.md"
    fi
    chmod +x "$APP/scripts/compasso-mac.sh"

    if [ -n "$backup" ]; then "$PY" "$APP/server/compasso.py" --data "$DATA" --import "$backup"; fi

    write_plist
    launchctl bootstrap "$DOMAIN" "$PLIST"
    wait_up || fail_log
    say ""
    say "✓ Compasso instalado e rodando em $URL"
    say "  dados:   $DATA/compasso.db (backup automático diário em $DATA/backups)"
    say "  liga sozinho quando você entra no Mac."
    open "$URL"
    ;;

  desinstalar)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    rm -rf "$APP"
    say "Serviço removido. Seus dados continuam em $DATA (apague a pasta à mão se quiser)."
    ;;

  status)
    if info=$(up); then say "rodando em $URL · $info"; else say "parado"; fi
    loaded && say "serviço: carregado (liga no login)" || say "serviço: não carregado"
    ;;

  iniciar)
    [ -f "$PLIST" ] || { say "Serviço não instalado. Rode: $0 instalar"; exit 1; }
    loaded && launchctl kickstart "$DOMAIN/$LABEL" || launchctl bootstrap "$DOMAIN" "$PLIST"
    wait_up || fail_log
    say "rodando em $URL"
    ;;

  parar)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    say "parado (volta a ligar no próximo login, ou com: $0 iniciar)"
    ;;

  reiniciar)
    if loaded; then launchctl kickstart -k "$DOMAIN/$LABEL"; else launchctl bootstrap "$DOMAIN" "$PLIST"; fi
    wait_up || fail_log
    say "rodando em $URL"
    ;;

  log)
    tail -n 40 -f "$LOGS/servidor.log"
    ;;

  abrir)
    open "$URL"
    ;;

  *)
    sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
