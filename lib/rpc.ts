import { supabase } from '@/lib/supabase/client'

/**
 * Single sanctioned way to call a Supabase RPC from the app.
 *
 * It guards two foot-guns that have bitten this codebase:
 *
 *  1. **`this`-detach** — `const x = supabase.rpc; x('fn')` loses `this` and throws
 *     "Cannot read … 'rest'". We always invoke as a member call.
 *
 *  2. **Soft `{ error }` jsonb** — many SECURITY DEFINER RPCs (in-seat portal, cash
 *     drawer, invites, payment creds …) don't `raise`; they RETURN
 *     `{ ok:false, error:'...' }`. Supabase puts that in `data`, NOT `error`, so a
 *     caller that only checks `error` treats a failure as success. `callRpc` folds
 *     a soft error INTO the `error` channel (with `soft:true`) so the default
 *     `if (error)` path is always safe. `data` is still returned, so a caller that
 *     wants to treat a specific soft code as non-fatal can inspect `data.error`.
 *
 * Convention: prefer `callRpc` over `supabase.rpc(...)` for any RPC, especially on
 * money/cash paths. New financial RPCs should still raise; this is the safety net.
 */

export interface RpcError {
  message: string
  /** the soft `{error}` code, or the Postgres error code for hard errors */
  code?: string
  /** true = the RPC returned `{error}` jsonb; false = a thrown/Postgres error */
  soft: boolean
}

export interface RpcResult<T> {
  data: T | null
  error: RpcError | null
}

export async function callRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<RpcResult<T>> {
  // member call — never let `this` detach
  const { data, error } = await (
    supabase.rpc as unknown as (
      f: string,
      a: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
  )(fn, args)

  if (error) {
    return { data: null, error: { message: error.message, code: error.code, soft: false } }
  }

  // fold a soft `{error}` jsonb into the error channel
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const soft = (data as { error?: unknown }).error
    if (soft) {
      return {
        data: data as T,
        error: { message: String(soft), code: String(soft), soft: true },
      }
    }
  }

  return { data: data as T, error: null }
}
