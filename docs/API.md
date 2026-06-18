# Martelounge API (v1)

პროგრამული + მოწყობილობის წვდომა შენი ვენიუს მონაცემებზე API გასაღებით.
Programmatic + device access to your venue, authenticated with an API key.

> **არქიტექტურა:** გასაღები იქმნება პანელში (Phase 1, migration 0091) → ინახება მხოლოდ
> sha256 hash. ეს API (the gateway, edge function `api-gateway` + migration 0092) გასაღებს
> ამოწმებს `verify_api_key`-ით, ამოწმებს scope-ებს და უშვებს მოქმედებას. პლატფორმა JWT-ს
> არ ითხოვს — მოწყობილობას მხოლოდ თავისი `mk_` გასაღები სჭირდება.

## 1. გასაღების აღება / Get a key

ადმინ პანელი → **პარამეტრები → API გასაღებები** → „გასაღების გენერაცია".
აირჩიე უფლებები (scopes), დააკოპირე გასაღები **მაშინვე** — მეორედ აღარ გამოჩნდება.

(პლატფორმის გასაღები: God Mode → „პლატფორმის API გასაღებები".)

## 2. Base URL & Auth

```
Base:  https://rvlkimzqzwizcivkxtnd.supabase.co/functions/v1/api-gateway
Auth:  Authorization: Bearer mk_live_xxxxxxxxxxxx
```

ჯავშნის ტესტი:

```bash
curl https://rvlkimzqzwizcivkxtnd.supabase.co/functions/v1/api-gateway/v1/ping \
  -H "Authorization: Bearer mk_live_xxxxxxxxxxxx"
# -> { "ok": true, "org_id": "...", "scopes": [...], "platform": false }
```

## 3. Endpoints

| Method | Path | Scope | აღწერა |
|---|---|---|---|
| `GET` | `/v1/ping` | (any) | გასაღების შემოწმება — org + scopes |
| `GET` | `/v1/devices` | `device:hardware` ან `read:sessions` | თითო კონსოლის სასურველი მდგომარეობა (`power: on/off`) — ლოკალური აგენტისთვის |
| `POST` | `/v1/devices/state` | `device:hardware` | აგენტი აფიქსირებს ფაქტობრივ მდგომარეობას |
| `GET` | `/v1/sessions?limit=` | `read:sessions` | ბოლო სესიები (limit ≤ 100) |
| `GET` | `/v1/analytics` | `read:analytics` | დღევანდელი მაჩვენებლები (თბილისის დღე) |

`POST /v1/devices/state` body:

```json
{ "console_id": 64, "state": "on", "success": true, "error": null }
```

შეცდომები: `401 invalid_api_key` · `403 insufficient_scope` · `400 org_key_required` · `404 not_found`.

## 4. Raspberry Pi / ESP32 example (Python)

ვენიუში დამონტაჟებული Pi ეკითხება gateway-ს „რომელი კონსოლი უნდა იყოს ჩართული?",
შესაბამისად რთავს რელეებს, და აბრუნებს ფაქტობრივ მდგომარეობას. პოლინგი ყოველ ~15წმ-ში.

```python
#!/usr/bin/env python3
# pip install requests ; (relays) RPi.GPIO
import time, requests
# import RPi.GPIO as GPIO   # uncomment on a real Pi

API   = "https://rvlkimzqzwizcivkxtnd.supabase.co/functions/v1/api-gateway"
KEY   = "mk_live_xxxxxxxxxxxx"          # generate in პარამეტრები → API გასაღებები
H     = {"Authorization": f"Bearer {KEY}"}

# map a console_id (from /v1/devices) to the Pi's relay GPIO pin
RELAY = { 64: 17, 65: 27, 66: 22 }

def set_relay(pin, on):
    print(f"  relay GPIO{pin} -> {'ON' if on else 'OFF'}")
    # GPIO.output(pin, GPIO.HIGH if on else GPIO.LOW)

def loop():
    r = requests.get(f"{API}/v1/devices", headers=H, timeout=10)
    for d in r.json().get("devices", []):
        pin = RELAY.get(d["console_id"])
        if pin is None:
            continue
        want_on = d["power"] == "on"
        set_relay(pin, want_on)
        # acknowledge actual state back to the platform (anti-fraud audit trail)
        requests.post(f"{API}/v1/devices/state", headers=H, timeout=10,
                      json={"console_id": d["console_id"],
                            "state": "on" if want_on else "off"})

if __name__ == "__main__":
    # GPIO.setmode(GPIO.BCM); [GPIO.setup(p, GPIO.OUT) for p in RELAY.values()]
    while True:
        try: loop()
        except Exception as e: print("err:", e)
        time.sleep(15)
```

`power` რეგულირდება სესიით: აქტიური სესია → `on`, არააქტიური → `off` (ან owner-ის
`desired_state`-ით hardware კონფიგში). ასე Pi-მ TV/კონსოლი/ლამპი ავტომატურად ჩართოს/გამორთოს
სესიის მიხედვით — ანტი-თაღლითობა + ენერგია.

## 5. გასაღების უსაფრთხოება

- გასაღები = პაროლი. არ ჩადო public რეპოში / frontend-ში. მოწყობილობაზე — env/config-ში.
- გაჟონა? პანელში **გააუქმე** (მყისიერი) და დააგენერირე ახალი.
- მიეცი **მინიმალური** scope-ები (მაგ. Pi-ს მხოლოდ `device:hardware`).

---

### Maintainer note
`api-gateway` **ყოველთვის** უნდა დაიდიპლოოს `--no-verify-jwt`-ით (მოწყობილობას Supabase
JWT არ აქვს — მხოლოდ `mk_` გასაღები). config.toml ამ რეპოში არ არის (deploy იყენებს
`--use-api`-ს), ამიტომ ფლაგი ხელით უნდა გადაეცეს:

```
npx supabase functions deploy api-gateway --no-verify-jwt --project-ref rvlkimzqzwizcivkxtnd --use-api
```

Phase 2 surface = device poll/ack + read sessions/analytics. შემდეგ: write (bookings/orders),
per-key rate-limit, platform-key cross-tenant routes.
