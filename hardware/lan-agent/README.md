# 🔌 Martelounge LAN Hardware Agent

A small always-on daemon that runs at the venue and ties each console's relay to
its Martelounge session — so a console/TV **can't run without an open session**
(anti-fraud + honest RevPACH). For relays on the **local network** (Shelly-LAN,
Tasmota, generic HTTP). Cloud-Shelly venues don't need this (handled server-side).

## How it works
```
   admin panel / session start-end
            │  set_console_power()  → console_hardware.desired_state
            ▼
   Supabase api-gateway   ── GET /v1/devices ──►  THIS AGENT (venue LAN)
   (mk_ API key auth)     ◄─ POST /v1/devices/state ─┘   ──► flips the LAN relay
```
- **Cloud-authoritative:** the per-console `driver` + `config` (e.g. Shelly IP +
  channel) come from the gateway. The owner configures everything in the admin
  panel; the agent is essentially zero-config (just `GATEWAY_URL` + `API_KEY`).
- **Pull only:** outbound HTTPS, firewall-friendly, no inbound ports.
- **Fail-safe:** if the gateway/network is unreachable the agent **holds** the
  last applied relay state — a network blip never cuts a paying customer. State
  is persisted, so a restart doesn't surprise-flip relays.
- Owns **only** consoles with `control_mode = 'agent'`.

## Supported relays (drivers)
| `driver` | config | notes |
|---|---|---|
| `shelly_lan` (`shelly`) | `{ ip, channel?=0, gen?='gen2', user?, password? }` | Shelly Plus/Pro (gen2 RPC) or gen1 |
| `tasmota` | `{ ip, channel?=1, user?, password? }` | Tasmota `Power<ch>` |
| `http_generic` (`http`) | `{ on_url, off_url, method?='GET', user?, password? }` | any HTTP relay |
| `mock` / `none` | — | simulated (dry-run / not wired yet) |

> Modbus/TCP relay boards and direct Pi-GPIO are intentionally a follow-on —
> add a driver class in `agent.py` when a venue needs one (the registry is the
> only touch-point; nothing else changes).

## Install (Raspberry Pi / Debian)
```bash
sudo ./install.sh
sudo nano /opt/martelounge-agent/martelounge-agent.env   # GATEWAY_URL + API_KEY
sudo -u martelounge /opt/martelounge-agent/.venv/bin/python \
     /opt/martelounge-agent/agent.py --once --dry-run -v   # validate the loop
sudo systemctl start martelounge-agent
journalctl -u martelounge-agent -f
```

## Setup checklist
1. Admin panel → **პარამეტრები → API გასაღებები** → new key, scope **`🔌 device:hardware`**.
2. Admin panel → console hardware → `control_mode = agent`, pick the `driver`,
   set `config` (relay IP / channel).
3. Put the Pi on the **same LAN** as the relays (ideally an isolated VLAN with no
   inbound internet — the agent only needs outbound HTTPS).
4. Run with `DRY_RUN=true` first; confirm the poll/reconcile/ack loop in the logs,
   then flip to `false` for real actuation.

## Local dev / test (no Pi, no hardware)
```bash
pip install -r requirements.txt
GATEWAY_URL=https://<ref>.supabase.co API_KEY=mk_... python agent.py --once --dry-run -v
```
`--dry-run` routes every actuation through the mock relay, so you can validate the
whole loop against the live gateway with zero hardware.
