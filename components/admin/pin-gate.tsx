'use client'

import { useState } from 'react'
import { Delete, Lock, LoaderCircle, Gamepad2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrg } from '@/lib/org'
import { usePlayroom } from '@/lib/store'

export function PinGate() {
  const { signInWithPin, enterAsOwner, currentRole, venues, currentVenueId } = useOrg()
  const { pushToast } = usePlayroom()
  const canEnterAsOwner = currentRole === 'owner' || currentRole === 'admin'
  
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [shaking, setShaking] = useState(false)
  
  const venueName = venues.find(v => v.id === currentVenueId)?.name ?? 'Playroom'

  const handlePress = (digit: string) => {
    if (loading) return
    if (pin.length < 6) {
      setPin(prev => prev + digit)
    }
  }

  const handleBackspace = () => {
    if (loading) return
    setPin(prev => prev.slice(0, -1))
  }

  const handleSubmit = async () => {
    if (pin.length < 4 || loading) return
    
    setLoading(true)
    const { ok, error } = await signInWithPin(pin)
    setLoading(false)
    
    if (!ok) {
      setPin('')
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
      
      if (error === 'rate_limit_exceeded') {
        pushToast('danger', 'ბევრი მცდელობა — დაელოდე წუთს')
      } else {
        pushToast('danger', 'PIN არასწორია')
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background p-6">
      <div className={cn(
        "flex w-full max-w-sm flex-col items-center gap-8 transition-transform duration-500",
        shaking && "animate-shake"
      )}>
        
        {/* Brand/Header */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="nm-raised-sm flex size-16 items-center justify-center rounded-3xl">
            <Gamepad2 className="size-8 text-primary" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight">{venueName}</h1>
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">ტერმინალი დაბლოკილია</p>
          </div>
        </div>

        {/* PIN Display */}
        <div className="flex flex-col items-center gap-6 w-full">
          <div className="nm-inset flex h-16 w-full items-center justify-center gap-4 rounded-2xl px-6">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={cn(
                  "size-3 rounded-full transition-all duration-200",
                  i < pin.length 
                    ? "bg-primary scale-125 drop-shadow-[0_0_8px_var(--primary)]" 
                    : "bg-muted-foreground/20"
                )}
              />
            ))}
          </div>
        </div>

        {/* Keypad */}
        <div className="grid w-full grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              onClick={() => handlePress(n.toString())}
              className="nm-btn h-16 rounded-2xl text-xl font-black transition-transform active:scale-95"
            >
              {n}
            </button>
          ))}
          <button
            onClick={handleBackspace}
            className="nm-btn flex h-16 items-center justify-center rounded-2xl text-muted-foreground active:scale-95"
          >
            <Delete className="size-6" />
          </button>
          <button
            onClick={() => handlePress('0')}
            className="nm-btn h-16 rounded-2xl text-xl font-black transition-transform active:scale-95"
          >
            0
          </button>
          <button
            onClick={handleSubmit}
            disabled={pin.length < 4 || loading}
            className={cn(
              "nm-daylight flex h-16 items-center justify-center rounded-2xl font-black transition-all active:scale-95",
              pin.length < 4 ? "opacity-50 grayscale cursor-not-allowed" : "text-primary"
            )}
          >
            {loading ? <LoaderCircle className="size-6 animate-spin" /> : <Lock className="size-6" />}
          </button>
        </div>

        {/* Owner/admin can skip the PIN (no lockout). Hands off to staff via Lock. */}
        {canEnterAsOwner && (
          <button
            onClick={enterAsOwner}
            className="nm-btn rounded-2xl px-5 py-2.5 text-sm font-bold text-muted-foreground transition-transform active:scale-95"
          >
            მფლობელად შესვლა (PIN-ის გარეშე)
          </button>
        )}

        {/* Footer info */}
        <p className="text-xs font-medium text-muted-foreground/40">
          Playroom OS &bull; Secure Terminal Access
        </p>
      </div>
    </div>
  )
}
