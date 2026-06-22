#!/usr/bin/env python3
"""Martelounge LAN hardware agent.

Runs at the venue (Raspberry Pi, or any always-on box on the same LAN as the
relays). Polls the Martelounge api-gateway for each console's DESIRED relay
state and drives the local LAN relay so a console/TV can't run without an open
session (anti-fraud + accurate RevPACH).

Design (see HARDWARE_LAN_AGENT_DESIGN.md):
- CLOUD-AUTHORITATIVE: the per-console driver + connection config come from the
  gateway (`api_device_list`), so this agent is essentially zero-config. The
  owner sets everything in the admin panel; the Pi just executes.
- PULL, firewall-friendly: only outbound HTTPS to the gateway. No inbound ports.
- FAIL-SAFE: on a gateway/network failure the agent HOLDS the last applied state
  (it never cuts a paying customer's console because the internet hiccuped).
  Applied state is persisted so a restart doesn't flip relays unexpectedly.
- The agent owns ONLY consoles whose control_mode == 'agent' (cloud-Shelly and
  manual consoles are handled elsewhere — never fight the cloud executor).

Auth: an API key (mk_...) issued in the admin panel with scope `device:hardware`.

Only hard dependency: `requests`. Relay-specific deps (pymodbus / RPi.GPIO) are
imported lazily inside their drivers so the agent runs on any machine in dry-run.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import signal
import sys
import time
from typing import Optional

import requests

LOG = logging.getLogger("mtl-agent")

# --------------------------------------------------------------------------- #
# Config (env vars, with an optional .env file)
# --------------------------------------------------------------------------- #
def _load_env_file(path: str) -> None:
    if not path or not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


_HERE = os.path.dirname(os.path.abspath(__file__))
_load_env_file(os.environ.get("AGENT_ENV_FILE", os.path.join(_HERE, "martelounge-agent.env")))


class Config:
    def __init__(self) -> None:
        self.gateway_url = os.environ.get("GATEWAY_URL", "").rstrip("/")
        self.api_key = os.environ.get("API_KEY", "")
        self.poll_interval = float(os.environ.get("POLL_INTERVAL", "5"))
        self.http_timeout = float(os.environ.get("HTTP_TIMEOUT", "4"))
        self.dry_run = os.environ.get("DRY_RUN", "false").lower() in ("1", "true", "yes")
        self.state_file = os.environ.get("STATE_FILE", os.path.join(_HERE, "agent-state.json"))

    def validate(self) -> None:
        missing = [n for n, v in (("GATEWAY_URL", self.gateway_url), ("API_KEY", self.api_key)) if not v]
        if missing:
            raise SystemExit(f"config error: missing {', '.join(missing)} (set env or martelounge-agent.env)")
        if not self.api_key.startswith("mk_"):
            raise SystemExit("config error: API_KEY must be a Martelounge key (mk_...)")


# --------------------------------------------------------------------------- #
# Relay drivers — set_power(config, on) -> bool (True = success)
# --------------------------------------------------------------------------- #
class Driver:
    """Base relay driver. `config` is the per-console jsonb from the cloud."""

    name = "base"

    def set_power(self, config: dict, on: bool) -> bool:  # pragma: no cover - abstract
        raise NotImplementedError


class MockDriver(Driver):
    """Simulated relay — used in --dry-run and for driver 'none'/'mock'.
    Proves the full poll/reconcile/ack loop without any physical hardware."""

    name = "mock"

    def set_power(self, config: dict, on: bool) -> bool:
        LOG.info("        [MOCK] relay -> %s  (config=%s)", "ON" if on else "OFF", config or {})
        return True


class ShellyLanDriver(Driver):
    """Shelly relay on the LAN. config: { ip, channel?=0, gen?='gen2', auth? }.
    Gen2 (Plus/Pro): /rpc/Switch.Set?id=<ch>&on=<bool>. Gen1: /relay/<ch>?turn=on|off."""

    name = "shelly_lan"

    def set_power(self, config: dict, on: bool) -> bool:
        ip = config.get("ip")
        if not ip:
            LOG.error("        [shelly] missing 'ip' in config")
            return False
        ch = int(config.get("channel", 0))
        gen = str(config.get("gen", "gen2")).lower()
        timeout = float(config.get("timeout", 4))
        if gen == "gen1":
            url = f"http://{ip}/relay/{ch}?turn={'on' if on else 'off'}"
        else:
            url = f"http://{ip}/rpc/Switch.Set?id={ch}&on={'true' if on else 'false'}"
        try:
            r = requests.get(url, timeout=timeout, auth=_basic_auth(config))
            r.raise_for_status()
            return True
        except requests.RequestException as exc:
            LOG.error("        [shelly] %s failed: %s", url, exc)
            return False


class TasmotaDriver(Driver):
    """Tasmota relay on the LAN. config: { ip, channel?=1, auth? }.
    /cm?cmnd=Power<ch>%20<ON|OFF>."""

    name = "tasmota"

    def set_power(self, config: dict, on: bool) -> bool:
        ip = config.get("ip")
        if not ip:
            LOG.error("        [tasmota] missing 'ip' in config")
            return False
        ch = int(config.get("channel", 1))
        timeout = float(config.get("timeout", 4))
        url = f"http://{ip}/cm?cmnd=Power{ch}%20{'ON' if on else 'OFF'}"
        try:
            r = requests.get(url, timeout=timeout, auth=_basic_auth(config))
            r.raise_for_status()
            return True
        except requests.RequestException as exc:
            LOG.error("        [tasmota] %s failed: %s", url, exc)
            return False


class HttpGenericDriver(Driver):
    """Any relay exposed over HTTP. config: { on_url, off_url, method?='GET', auth? }.
    Escape hatch for relays we don't have a named driver for yet."""

    name = "http_generic"

    def set_power(self, config: dict, on: bool) -> bool:
        url = config.get("on_url" if on else "off_url")
        if not url:
            LOG.error("        [http] missing %s in config", "on_url" if on else "off_url")
            return False
        method = str(config.get("method", "GET")).upper()
        timeout = float(config.get("timeout", 4))
        try:
            r = requests.request(method, url, timeout=timeout, auth=_basic_auth(config))
            r.raise_for_status()
            return True
        except requests.RequestException as exc:
            LOG.error("        [http] %s %s failed: %s", method, url, exc)
            return False


def _basic_auth(config: dict):
    user, pw = config.get("user"), config.get("password")
    return (user, pw) if user and pw else None


# Driver registry. Add new relay families here (modbus_tcp / gpio are intentionally
# left as a follow-on — wire them when a venue actually needs them).
DRIVERS: dict[str, Driver] = {
    "shelly_lan": ShellyLanDriver(),
    "shelly": ShellyLanDriver(),
    "tasmota": TasmotaDriver(),
    "http_generic": HttpGenericDriver(),
    "http": HttpGenericDriver(),
    "mock": MockDriver(),
    "none": MockDriver(),
}
_MOCK = MockDriver()


# --------------------------------------------------------------------------- #
# Local applied-state cache (fail-safe across restarts)
# --------------------------------------------------------------------------- #
def load_state(path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as fh:
            return {str(k): v for k, v in json.load(fh).items()}
    except (OSError, ValueError):
        return {}


def save_state(path: str, state: dict) -> None:
    try:
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(state, fh)
        os.replace(tmp, path)
    except OSError as exc:
        LOG.warning("could not persist state to %s: %s", path, exc)


# --------------------------------------------------------------------------- #
# Gateway client
# --------------------------------------------------------------------------- #
class Gateway:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.s = requests.Session()
        self.s.headers.update({"Authorization": f"Bearer {cfg.api_key}", "Content-Type": "application/json"})

    def _url(self, path: str) -> str:
        return f"{self.cfg.gateway_url}/functions/v1/api-gateway{path}"

    def list_devices(self) -> Optional[list]:
        r = self.s.get(self._url("/v1/devices"), timeout=self.cfg.http_timeout)
        r.raise_for_status()
        return (r.json() or {}).get("devices", [])

    def report_state(self, console_id: int, state: str, success: bool = True, error: Optional[str] = None) -> None:
        body = {"console_id": console_id, "state": state, "success": success}
        if error:
            body["error"] = error
        self.s.post(self._url("/v1/devices/state"), data=json.dumps(body), timeout=self.cfg.http_timeout)

    def heartbeat(self) -> None:
        # Optional: bumps console_hardware.last_seen_at for the 'agent online' badge.
        # Tolerated if the route doesn't exist yet (older backend) — never fatal.
        try:
            self.s.post(self._url("/v1/devices/heartbeat"), data="{}", timeout=self.cfg.http_timeout)
        except requests.RequestException:
            pass


# --------------------------------------------------------------------------- #
# Reconcile one poll
# --------------------------------------------------------------------------- #
def reconcile(gw: Gateway, cfg: Config, applied: dict) -> None:
    devices = gw.list_devices()  # raises on network/gateway error -> caught by caller (hold state)
    agent_consoles = [d for d in (devices or []) if d.get("control_mode") == "agent"]
    if not agent_consoles:
        LOG.debug("no agent-controlled consoles in this org yet")
    for d in agent_consoles:
        cid = str(d["console_id"])
        desired = "on" if d.get("power") == "on" else "off"
        if applied.get(cid) == desired:
            continue  # already in the right state

        if cfg.dry_run:
            driver = _MOCK
        else:
            driver = DRIVERS.get(d.get("driver", "none"))
            if driver is None:
                # NEVER fake success in production: an unimplemented driver is a config
                # error. Report failure (visible in the panel) and retry next poll —
                # do not mark it applied, so it stays honestly "broken" until fixed.
                LOG.error(
                    "console %s: driver %r not implemented by this agent "
                    "(supported: shelly_lan, tasmota, http_generic) — reporting failure",
                    cid, d.get("driver"),
                )
                try:
                    gw.report_state(int(cid), applied.get(cid, "off"), success=False,
                                    error=f"driver_not_implemented:{d.get('driver')}")
                except requests.RequestException:
                    pass
                continue
        LOG.info(
            "console %s (%s): %s -> %s via %s%s",
            cid, d.get("name", "?"), applied.get(cid, "unknown"), desired,
            "mock" if cfg.dry_run else d.get("driver", "none"), "  [dry-run]" if cfg.dry_run else "",
        )
        ok = driver.set_power(d.get("config") or {}, desired == "on")
        if ok:
            applied[cid] = desired
            save_state(cfg.state_file, applied)
            try:
                gw.report_state(int(cid), desired, success=True)
            except requests.RequestException as exc:
                LOG.warning("console %s: state applied but ack failed: %s", cid, exc)
        else:
            try:
                gw.report_state(int(cid), applied.get(cid, "off"), success=False, error=f"driver {d.get('driver')} failed")
            except requests.RequestException:
                pass
    gw.heartbeat()


# --------------------------------------------------------------------------- #
# Main loop
# --------------------------------------------------------------------------- #
_RUNNING = True


def _stop(signum, _frame):
    global _RUNNING
    LOG.info("signal %s received -> stopping (relays HOLD their current state)", signum)
    _RUNNING = False


def main() -> int:
    ap = argparse.ArgumentParser(description="Martelounge LAN hardware agent")
    ap.add_argument("--once", action="store_true", help="run a single poll then exit (for testing)")
    ap.add_argument("--dry-run", action="store_true", help="simulate relays (no physical actuation)")
    ap.add_argument("-v", "--verbose", action="store_true", help="debug logging")
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-5s %(message)s",
        datefmt="%H:%M:%S",
    )

    cfg = Config()
    if args.dry_run:
        cfg.dry_run = True
    cfg.validate()

    LOG.info(
        "Martelounge agent starting | gateway=%s | poll=%ss | dry_run=%s",
        cfg.gateway_url, cfg.poll_interval, cfg.dry_run,
    )
    gw = Gateway(cfg)
    applied = load_state(cfg.state_file)
    if applied:
        LOG.info("restored applied-state for %d console(s): %s", len(applied), applied)

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    while _RUNNING:
        try:
            reconcile(gw, cfg, applied)
        except requests.RequestException as exc:
            # FAIL-SAFE: gateway/network unreachable -> hold last applied state.
            LOG.warning("gateway unreachable, holding state: %s", exc)
        except Exception as exc:  # never let one bad poll kill the daemon
            LOG.exception("unexpected error in poll: %s", exc)

        if args.once:
            break
        slept = 0.0
        while _RUNNING and slept < cfg.poll_interval:
            time.sleep(min(0.5, cfg.poll_interval - slept))
            slept += 0.5

    LOG.info("agent stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
