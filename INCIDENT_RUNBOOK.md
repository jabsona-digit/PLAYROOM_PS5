# Martelounge — Incident Runbook

> One page for "something is broken in production." Solo-founder ops (Jabs).
> Keep it boring: **diagnose → contain → fix → verify**. P1-4 of the senior review.

## 0. First 60 seconds — where to look
1. **Sentry** → `martelounge.sentry.io` → Issues. Two projects:
   - `martelounge-admin` (app.martelounge.ge, browser errors)
   - `martelounge-web` (play.martelounge.ge, browser errors)
2. **Is the site even up?** open https://app.martelounge.ge (login) and https://play.martelounge.ge.
3. **Supabase health:** https://status.supabase.com + dashboard → project `rvlkimzqzwizcivkxtnd` → Logs.
4. **Cloudflare:** dash.cloudflare.com → Pages (playroom-ps5, martelounge-site) / Workers (martelounge-web) → latest deploy + logs.

## 1. The three apps + how to ROLL BACK
| App | URL | Host | Rollback |
|---|---|---|---|
| Admin | app.martelounge.ge | CF **Pages** (`playroom-ps5`) | CF Pages → Deployments → pick last-good → **Rollback** (instant). Or `git revert <bad> && push`. |
| Marketing | martelounge.ge | CF **Pages** (`martelounge-site`) | same (CF Pages rollback) |
| Marketplace | play.martelounge.ge | CF **Worker** (OpenNext) | `cd martelounge-web && npx wrangler rollback` (previous Worker version), or fix + `npm run deploy`. CF dash → Workers → martelounge-web → Deployments shows versions. |

> Admin/marketing auto-deploy on push to their default branch; **CF Pages "Rollback" is the fastest undo** (no rebuild). The marketplace deploys manually (`npm run deploy`).

## 2. Common failure modes
- **DB / RLS error after a migration** → a migration went bad. Migrations are applied to LIVE (no staging yet). Check `supabase_migrations.schema_migrations`; write a corrective migration (we don't blind-rollback DDL on a money DB). Re-run the invariant tests: `supabase/tests/money_invariants.sql` + `rls_isolation.sql`.
- **Telegram alerts stopped** → token in Vault (`telegram_bot_token`) or a toggle. Diagnose pg_net delivery: `select created, status_code, content from net._http_response order by created desc limit 10;` (403/401 = token/secret; nothing = toggle off, see [[telegram-bot]] toggle-gotcha).
- **Booking reminder emails not sending** → Resend. Same `net._http_response` query (403 "domain not verified" / 401 "restricted key"). Vault secret `resend_api_key`. See [[booking-reminders]].
- **AI assistant failing** → edge fn `ai-assistant`; check Supabase → Edge Functions → Logs. `GEMINI_API_KEY` secret (fresh GCP project) + `ai_rate_limit`.
- **CI gen-types red** → `SUPABASE_ACCESS_TOKEN` (now a NEVER token; if rotated, update the GitHub secret + the User env var). See [[project-github-actions-token]].
- **"permission denied" / cross-tenant worry** → re-run `supabase/tests/rls_isolation.sql` (RLS is the only admin boundary).

## 3. Secrets & where they live (NEVER in git)
- **Supabase access token** — GitHub Actions secret (repo PLAYROOM_PS5) + User Windows env var `SUPABASE_ACCESS_TOKEN` (NEVER-expiring as of 2026-06-22).
- **Supabase Vault** (`vault.decrypted_secrets`): `telegram_bot_token`, `resend_api_key`, hardware cloud keys, per-tenant TBC/BOG payment creds.
- **Edge fn env secrets**: `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.
- **Sentry DSNs** are public (in the client bundle) — not secret.
- If a secret leaks: rotate at the provider → update the Vault secret / GitHub secret / env var. (Resend key + the Supabase access token were pasted in chat 2026-06-22 → rotate when convenient.)
- ⚠️ **`SUPABASE_ACCESS_TOKEN` is NEVER-expiring** (convenient, but never auto-invalidates). **If it leaks → revoke it immediately** at supabase.com → Account → Access Tokens, **reissue**, and update the GitHub secret + the Windows User env var. Prefer storing it outside a plain user env var if practical (it grants full Management-API control of the project).

## 4. Deploy cheat-sheet
- Migrations: Management API query endpoint with `SUPABASE_ACCESS_TOKEN`; record in `schema_migrations`; regenerate `lib/database.types.ts` (CI does it on push). Georgian in SQL → manual-escape apply (see [[migration-apply-method]]).
- Admin/marketing: `git push` → CF Pages auto-build. Always `npx tsc --noEmit` first (CI gate `typecheck.yml` also runs it; `next build` skips TS).
- Marketplace: `cd martelounge-web && npm run deploy`.
- Edge functions: `npx --yes supabase@latest functions deploy <name> --project-ref rvlkimzqzwizcivkxtnd --use-api` (telegram-bot/api-gateway need `--no-verify-jwt`).

## 5b. Pre-first-venue checklist (do BEFORE onboarding the FIRST real venue)
Today migrations apply straight to prod (no staging). At 0 real venues that's safe — prod holds only
test data. The moment a REAL venue's data exists, a bad migration (wrong backfill, accidental DROP, broken
UPDATE) destroys someone's money history. ⚠️ The `db-invariants` CI suite does NOT cover this — it runs
*after* a migration already hit prod and only checks that the RULES still hold; it cannot catch a destructive
migration's data effect. **Staging covers a different risk.** So, as ONE checklist right before the first venue:
1. **Stand up a Supabase branch** (staging): create branch → apply the migration there → run
   `python supabase/tests/run_invariants.py supabase/tests/*.sql` against it → only then apply to prod.
2. **Confirm PITR / backups are ON** for the project (Supabase dashboard → Database → Backups).
3. **Do one restore drill** — restore a backup/PITR to a throwaway branch and confirm it works, once, while it's cheap to learn.
From then on: branch → test → merge for every migration that touches real-venue data.

### First-venue ONBOARDING runbook (owner-run, step-by-step)
> Goal: a real venue from zero → first live session. Each step has a **verify**. Do the gates FIRST.

**Phase 0 — gates (do BEFORE the venue runs its first real session):**
- [ ] **Supabase Pro + PITR ON** (dashboard → Settings → Billing → upgrade; Database → Backups → PITR). *Verify:* Backups shows daily + PITR enabled. (Blocking — see `prod-pitr-gap` memory.)
- [ ] **Leaked-password protection ON** (dashboard → Authentication → Policies). *Verify:* toggle on. (Before any B2C signup.)
- [ ] **RS.ge legal status known** — confirmed with the accountant whether Phase-B printing is legally sufficient or Phase C (fiscal device) is mandatory. *Verify:* a yes/no answer exists. (See `rsge-phase-c-scoping` memory once written.)

**Phase 1 — create the org & venue:**
- [ ] Owner signs up (email+password) at app.martelounge.ge. *Verify:* lands on the onboarding wizard.
- [ ] Wizard step 1: org name, **საკონტაქტო ტელეფონი (required)**, საიდენტიფიკაციო კოდი (TIN, optional), first venue name. *Verify:* dashboard opens; 3 default tariffs exist (Pricing → ტარიფები).
- [ ] Wizard step 2: add employees + PINs, or skip. *Verify:* either way the dashboard loads.

**Phase 2 — bring their existing data (Excel import — the time-saver):**
- [ ] Settings → **მონაცემების იმპორტი** → for each of კონსოლები / ტარიფები / კლიენტები: download the template, paste the venue's columns from their own Excel, upload. *Verify:* the success toast count matches; consoles appear on the dashboard, tariffs in Pricing, customers in კლიენტები. (Duplicates auto-skip — safe to re-upload.)

**Phase 3 — configure to the real venue:**
- [ ] If NOT a PS5 lounge (billiard/etc.): Settings → Marketplace → set **venue_type**. *Verify:* labels switch (კონსოლი↔მაგიდა).
- [ ] Pricing → check each tariff's real price + controllers/category. *Verify:* prices match the venue's board.
- [ ] (Optional) Settings → **„ფაქტობრივი დრო ადრე დასრულებისას"** toggle if the venue wants fair early-end on fixed sessions.

**Phase 4 — go live (at the venue):**
- [ ] Start one real session (fixed or open) on a console. *Verify:* timer/cost runs; In-Seat code shows.
- [ ] Ring up one bar item (ბარი). *Verify:* it lands in კასა revenue.
- [ ] End the session + take payment. *Verify:* კასა shows the cash/card total; History has the record.

**Phase 5 — optional / public-facing:**
- [ ] Marketplace profile: slug (auto), cover image, description, city, address, public phone → **Publish**. *Verify:* play.martelounge.ge/<slug> loads.
- [ ] Settings → Telegram: link the owner bot via the code. *Verify:* /revenue replies.
- [ ] Hardware: pair console_hardware (if relays installed). *Verify:* console card shows „ჩართული"/agent online.

**Phase 6 — platform billing (you, God Mode):**
- [ ] God Mode → Tenants → set the venue's plan (PRO/ENTERPRISE), give them the **billing reference (MTLxxxx)** + invoice amount. *Verify:* when they transfer, the bank shows the ref → click „გადაიხადა" → period extends.

## 5. Uptime monitoring (DONE — two layers)
1. **Sentry uptime monitors** (external, catches everything incl. Supabase-down) → emails the Sentry account email. `app.martelounge.ge` (5-min) + `play.martelounge.ge` (1-min), GET, env production, fail after 3 consecutive checks.
2. **Self-check → Telegram** (migration 0124, `platform_uptime_check()`, pg_cron `platform-uptime-check` every 3 min). GETs both sites via pg_net; on an up→down or down→up *transition* (not every tick → no spam) sends 🔴/🟢 to the founder's Telegram via `notify_platform_telegram('uptime', …)` (chat in `platform_telegram_config`, toggle `alerts->>'uptime'`). State + de-dup in `public.platform_uptime_state`. Detection ~3–6 min. Diagnose: `select * from public.platform_uptime_state;` (is_down/last_status) + `net._http_response` for the last_request_id. Self-check can't catch its OWN platform (Supabase) being down — that's what Sentry layer 1 is for.
