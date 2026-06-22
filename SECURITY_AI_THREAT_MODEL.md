# AI Assistant — Threat Model (senior-review P1-3)

> Scope: the `ai-assistant` Supabase Edge Function — the admin agent (Path B), the public guest
> concierge (Path F), receipt OCR (image path), and the read-only analytic paths (fraud audit C,
> RevPACH advisor D, daily brief E). Re-confirm these anchors after any edge-fn change.

## Core invariant — the AI never exceeds the caller
The edge fn builds its Supabase client from the **anon key + the caller's `Authorization` header**, and
**uses no `service_role` anywhere** (`index.ts:446-450`). So **every** DB op the AI performs runs under the
caller's own **RLS + role + suspension** — exactly the boundary proven clean by the RLS cross-tenant suite
(P1-2). Prompt injection therefore **cannot exceed what the caller could already do by hand**.

- Non-guest requests require a valid session: `getUser(token)` (`:459`); else 401.
- Per-caller throttle: `ai_rate_limit` 20/min (`:463`) + cost metering (migration 0125).

## Write tools are allow-listed AND confirm-gated
- The only write tools are `WRITE_TOOLS = {start_session, start_open_session, end_session, create_bar_sale, restock_product}` (`:54`).
- When the model emits a write tool it does **not execute** — the fn returns `{type:'confirm', action}`; the UI
  shows a card; only a **user-confirmed** `confirmedAction` runs. That handler **re-checks the allow-list**:
  `if (!WRITE_TOOLS.has(name)) return 400 'not a confirmable action'` (`:696`) → so a crafted `confirmedAction`
  **cannot invoke an arbitrary RPC**. Execution is always via `runTool` on the **caller's** `db.rpc(...)` (`:698`).
- **`venue_id` is server-resolved** from the caller's own venues (`:502`), **never taken from model args**
  (e.g. `create_bar_sale` passes `p_venue_id: venueId`, not an arg — `:317`). The AI cannot target another venue.
- **Argument validation lives at the authoritative RPC layer** (the real boundary): `create_bar_sale` validates
  `payment_method`/`bank` and **server-prices** items (0099); `restock_product` resolves the product name
  server-side; all of these are SECURITY DEFINER + RLS/role-gated + suspension-aware. The edge fn trusts the
  model for *nothing* security-relevant — only the RPC's own checks + RLS decide what actually happens.

## Untrusted inputs are DATA, never instructions
- **Receipt OCR** (the highest-suspicion path): an untrusted image → Gemini Vision → returns expense **fields**
  (`amount/date/category/description`) that only **pre-fill** the accounting form. The actual write is the
  separate, **user-confirmed** `add_expense` (RLS + role). A malicious/adversarial receipt can at worst
  mis-fill a form the user reviews before saving — it **cannot** trigger a write on its own, and its text is
  never executed as a tool/instruction.
- **Untrusted text** (product names, customer notes, guest chat): used purely as data. The **guest concierge is
  read-only** (`GUEST_TOOLS` = search venues / check availability — no write tools), so injection there has no
  write surface at all. In the admin agent, a hostile customer note can't escalate beyond the operator's own
  confirmed, RLS-bound actions.

## Blast radius & residual risks
- **Blast radius:** a caller's **own** confirmed actions within their **own** RLS rights. No service_role → no
  privilege-escalation path; no cross-tenant reach (P1-2).
- **Residual risk 1 — social engineering:** injected text could try to get a *user* to CONFIRM a bad action.
  Mitigation: the confirm card shows the concrete action before the user approves; the action is still
  RLS-bounded to their own org.
- **Residual risk 2 — model cost abuse:** mitigated by `ai_rate_limit` + per-org metering (`get_ai_usage_stats`).
- **Residual risk 3 — data to Gemini:** the model only ever sees the caller's RLS-visible data (the owner's own
  business data) — acceptable, and no other tenant's data is reachable.

## How to re-verify (definition of done)
1. Confirm the four anchors still hold: caller-JWT client build; `WRITE_TOOLS` allow-list at the
   `confirmedAction` handler; server-resolved `venue_id`; validation at the RPC (not trusted from model output).
2. Re-run the RLS cross-tenant suite (`supabase/tests/rls_isolation.sql`) — RLS is the enforcing boundary.
3. Any new AI write tool MUST: be added to `WRITE_TOOLS`, stay confirm-gated, resolve `venue_id`/ids
   server-side, and call an RLS+role-gated RPC that validates its own args.

_Verdict (2026-06-22): no code change required — the design is sound. This note is the durable record._
