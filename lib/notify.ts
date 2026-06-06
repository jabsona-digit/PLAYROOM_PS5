// Web Audio API alerts — spec §6. Lazily creates a single AudioContext and
// resumes it on demand (browsers keep it suspended until a user gesture, which
// the operator always provides by clicking around the panel).

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function beep(
  c: AudioContext,
  freq: number,
  start: number,
  dur: number,
  gain: number,
) {
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  osc.connect(g)
  g.connect(c.destination)
  g.gain.setValueAtTime(gain, start)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.start(start)
  osc.stop(start + dur)
}

/** Single soft chime — 10 / 5 minute warning. */
export function playWarning() {
  const c = audio()
  if (!c) return
  beep(c, 880, c.currentTime, 0.5, 0.25)
}

/** Three urgent beeps — time expired. */
export function playExpired() {
  const c = audio()
  if (!c) return
  const t = c.currentTime
  ;[0, 0.3, 0.6].forEach((offset) => beep(c, 440, t + offset, 0.2, 0.35))
}
