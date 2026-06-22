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

## 4. Deploy cheat-sheet
- Migrations: Management API query endpoint with `SUPABASE_ACCESS_TOKEN`; record in `schema_migrations`; regenerate `lib/database.types.ts` (CI does it on push). Georgian in SQL → manual-escape apply (see [[migration-apply-method]]).
- Admin/marketing: `git push` → CF Pages auto-build. Always `npx tsc --noEmit` first (CI gate `typecheck.yml` also runs it; `next build` skips TS).
- Marketplace: `cd martelounge-web && npm run deploy`.
- Edge functions: `npx --yes supabase@latest functions deploy <name> --project-ref rvlkimzqzwizcivkxtnd --use-api` (telegram-bot/api-gateway need `--no-verify-jwt`).

## 5. Uptime monitoring (TODO — set up in Sentry)
Sentry → **Alerts / Uptime Monitors** → add HTTP monitors for `https://play.martelounge.ge` and `https://app.martelounge.ge` (interval 5 min) → notify via email/Telegram. Until then, outages are noticed manually.
