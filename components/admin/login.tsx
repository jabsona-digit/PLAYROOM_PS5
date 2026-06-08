'use client'

import { useState } from 'react'
import { Gamepad2, LoaderCircle, LogIn, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

type Mode = 'signin' | 'signup'

export function Login() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (error) setError(error.message)
      return
    }

    const { data, error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    // if email confirmation is on, there is no session yet
    if (!data.session) {
      setInfo('ანგარიში შეიქმნა. დაადასტურე ელფოსტა (ან Dashboard-ში Auto-Confirm) და შედი.')
      setMode('signin')
    }
    // otherwise the auth listener swaps to the app automatically
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <div className="nm-raised w-full max-w-sm rounded-[2rem] p-8">
        <div className="flex flex-col items-center text-center">
          <div className="nm-raised-sm flex size-16 items-center justify-center rounded-3xl">
            <Gamepad2 className="size-8 text-primary" />
          </div>
          <h1 className="mt-6 text-3xl font-black tracking-tight">Martelounge</h1>
          <p className="mt-1 text-sm font-bold text-muted-foreground">
            Gaming Lounge Management System
          </p>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm text-muted-foreground">ელფოსტა</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@playroom.ge"
              className="nm-inset mt-2 w-full rounded-2xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>

          <label className="block">
            <span className="text-sm text-muted-foreground">პაროლი</span>
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="nm-inset mt-2 w-full rounded-2xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>

          {error ? (
            <p className="text-center text-sm font-semibold" style={{ color: 'var(--status-expired)' }}>
              {error}
            </p>
          ) : null}
          {info ? (
            <p className="text-center text-sm font-semibold" style={{ color: 'var(--status-free)' }}>
              {info}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="nm-btn flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold text-primary disabled:opacity-60"
          >
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : mode === 'signin' ? (
              <LogIn className="size-4" />
            ) : (
              <UserPlus className="size-4" />
            )}
            {mode === 'signin' ? 'შესვლა' : 'რეგისტრაცია'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
            setError(null)
            setInfo(null)
          }}
          className="mx-auto mt-6 block text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === 'signin'
            ? 'ანგარიში არ გაქვს? რეგისტრაცია'
            : 'უკვე გაქვს ანგარიში? შესვლა'}
        </button>
      </div>
    </div>
  )
}
