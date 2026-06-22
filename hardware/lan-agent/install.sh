#!/usr/bin/env bash
# Martelounge LAN agent installer (Raspberry Pi / Debian-like).
# Idempotent: re-run to update. Installs to /opt/martelounge-agent as a systemd service.
set -euo pipefail

DEST=/opt/martelounge-agent
SRC="$(cd "$(dirname "$0")" && pwd)"
USER_NAME=martelounge

echo "==> Martelounge LAN agent installer"

if [[ $EUID -ne 0 ]]; then echo "run with sudo"; exit 1; fi

# service user (no login)
id -u "$USER_NAME" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$USER_NAME"

mkdir -p "$DEST"
cp "$SRC/agent.py" "$DEST/agent.py"
[[ -f "$DEST/martelounge-agent.env" ]] || cp "$SRC/martelounge-agent.env.example" "$DEST/martelounge-agent.env"

# venv + deps
python3 -m venv "$DEST/.venv"
"$DEST/.venv/bin/pip" install --quiet --upgrade pip
"$DEST/.venv/bin/pip" install --quiet -r "$SRC/requirements.txt"

# state dir
install -d -o "$USER_NAME" -g "$USER_NAME" /var/lib/martelounge-agent
grep -q '^STATE_FILE=' "$DEST/martelounge-agent.env" 2>/dev/null || \
  echo 'STATE_FILE=/var/lib/martelounge-agent/agent-state.json' >> "$DEST/martelounge-agent.env"

chown -R "$USER_NAME:$USER_NAME" "$DEST"
chmod 600 "$DEST/martelounge-agent.env"

cp "$SRC/martelounge-agent.service" /etc/systemd/system/martelounge-agent.service
systemctl daemon-reload
systemctl enable martelounge-agent.service

echo
echo "==> Installed to $DEST"
echo "    1) edit the config:   sudo nano $DEST/martelounge-agent.env   (GATEWAY_URL + API_KEY)"
echo "    2) test the loop:     sudo -u $USER_NAME $DEST/.venv/bin/python $DEST/agent.py --once --dry-run -v"
echo "    3) start the service: sudo systemctl start martelounge-agent && journalctl -u martelounge-agent -f"
