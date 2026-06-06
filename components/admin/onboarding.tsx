'use client'

import { useState } from 'react'
import { Building2, LoaderCircle, LogOut, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/org'

export function Onboarding() {
  const { refresh } = useOrg()
  const [orgName, setOrgName] = useState('')
  const [venueName, setVenueName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.rpc('create_organization', {
      p_org_name: orgName,
      p_venue_name: venueName,
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    await refresh()
    // OrgProvider now has a membership → the shell swaps to the workspace
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <div className="nm-raised w-full max-w-md rounded-[2rem] p-8">
        <div className="flex flex-col items-center text-center">
          <div className="nm-raised-sm flex size-16 items-center justify-center rounded-3xl">
            <Sparkles className="size-8 text-primary" />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
            მოგესალმები! 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            შექმენი შენი ორგანიზაცია და პირველი ფილიალი — წამიერად დაიწყებ მუშაობას.
          </p>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm text-muted-foreground">ორგანიზაციის სახელი</span>
            <input
              required
              autoFocus
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="მაგ. Playroom Tbilisi"
              className="nm-inset mt-2 w-full rounded-2xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>

          <label className="block">
            <span className="text-sm text-muted-foreground">
              ფილიალის სახელი (არასავალდებულო)
            </span>
            <input
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              placeholder="მთავარი ფილიალი"
              className="nm-inset mt-2 w-full rounded-2xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>

          {error ? (
            <p
              className="text-center text-sm font-semibold"
              style={{ color: 'var(--status-expired)' }}
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="nm-btn flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold text-primary disabled:opacity-60"
          >
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Building2 className="size-4" />
            )}
            ორგანიზაციის შექმნა
          </button>
        </form>

        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="mx-auto mt-6 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <LogOut className="size-3.5" />
          გასვლა
        </button>
      </div>
    </div>
  )
}
