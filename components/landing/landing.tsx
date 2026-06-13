'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Gamepad2,
  Coffee,
  Wallet,
  Calculator,
  Users,
  Trophy,
  Globe,
  Sparkles,
  ArrowRight,
  Check,
  QrCode,
  CalendarClock,
  Phone,
  MessageCircle,
  Mail,
} from 'lucide-react'
import { motion } from 'motion/react'
import { Hero } from './hero'
import { DigitalPass } from './digital-pass'

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={`reveal${shown ? ' reveal-in' : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

const FEATURES = [
  { icon: Gamepad2, t: 'სესიები & კონსოლები', d: 'ფიქსირებული ან ღია (pay-as-you-go) სესიები, ცოცხალი ტაიმერებით და გაფრთხილებებით.', from: '#22d3ee', to: '#3b82f6' },
  { icon: Coffee, t: 'ბარი / POS', d: 'სწრაფი გაყიდვა, ბარკოდი, მარაგების მართვა — სესიის ანგარიშზევე.', from: '#a78bfa', to: '#d946ef' },
  { icon: Wallet, t: 'კასა & ფინანსები', d: 'შემოსავალი კონსოლებისა და პერიოდების მიხედვით, გადახდის არხები, Z-რეპორტი.', from: '#34d399', to: '#10b981' },
  { icon: Calculator, t: 'ბუღალტერია', d: 'P&L, დღგ (18%), ბიუჯეტები, ინვოისები, ხელფასები — ერთ ადგილას.', from: '#fbbf24', to: '#f59e0b' },
  { icon: Users, t: 'თანამშრომლები & PIN', d: 'როლები, PIN-შესვლა, ცვლები და ხელფასები პირდაპირ ბუღალტერიაში.', from: '#38bdf8', to: '#6366f1' },
  { icon: Trophy, t: 'ტურნირები', d: 'Single-elim ბადე, მატჩები, ავტომატური გამარჯვებული + TV რეჟიმი.', from: '#fbbf24', to: '#ef4444' },
  { icon: Globe, t: 'ონლაინ ჯავშნები', d: 'შენი კლუბი play.martelounge.ge-ზე — კლიენტები ჯავშნიან online.', from: '#2dd4bf', to: '#06b6d4' },
  { icon: Sparkles, t: 'AI ასისტენტი', d: 'ხმოვანი/ტექსტური დამხმარე — სესიები, გაყიდვები, რეპორტები კითხვით.', from: '#c084fc', to: '#ec4899' },
]

const STEPS = [
  { n: '1', t: 'დარეგისტრირდი', d: 'შექმენი ანგარიში და კლუბი წუთებში.' },
  { n: '2', t: 'დააყენე კონსოლები & ტარიფები', d: 'PS5-ები, კუპე/VIP, ფასები — შენ აკონტროლებ.' },
  { n: '3', t: 'მართე & გაყიდე online', d: 'ადგილზე მართე, ონლაინ ჯავშნები მიიღე — ერთ სისტემაში.' },
]

const CONTACTS = [
  { icon: Phone, t: 'დარეკე', v: '+995 500 05-75-27', href: 'tel:+995500057527', from: '#34d399', to: '#10b981' },
  { icon: MessageCircle, t: 'WhatsApp', v: 'მოგვწერე ახლავე', href: 'https://wa.me/995500057527', from: '#22d3ee', to: '#3b82f6' },
  { icon: Mail, t: 'ელფოსტა', v: 'martecompanygeo@gmail.com', href: 'mailto:martecompanygeo@gmail.com', from: '#c084fc', to: '#ec4899' },
]

const PLANS = [
  { name: 'Trial', price: '₾0', sub: '14 დღე', feats: ['1 ფილიალი', '4 კონსოლი', 'ძირითადი მოდულები'], cta: 'უფასო ცდა', highlight: false },
  { name: 'Pro', price: '₾45', sub: '/ თვე', feats: ['3 ფილიალი', 'ბარი + საწყობი', 'ბუღალტერია + ტურნირები', 'ონლაინ ჯავშნები'], cta: 'დაიწყე', highlight: true },
  { name: 'Enterprise', price: '₾65', sub: '/ თვე', feats: ['ულიმიტო', 'RS.GE ფისკალი', 'API + პრიორიტეტი'], cta: 'დაგვიკავშირდი', highlight: false },
]

export function Landing() {
  const auroraRef = useRef<HTMLDivElement>(null)

  // Subtle parallax: the aurora layer drifts with scroll + pointer (the blobs keep
  // their float animation inside — we transform the parent so it doesn't clash).
  useEffect(() => {
    const el = auroraRef.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let mx = 0, my = 0, raf = 0
    const apply = () => {
      raf = 0
      const sy = Math.min(window.scrollY * 0.12, 200) // bounded scroll parallax
      el.style.transform = `translate3d(${mx}px, ${sy + my}px, 0)`
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(apply) }
    const onMove = (e: PointerEvent) => {
      mx = (e.clientX / window.innerWidth - 0.5) * 28
      my = (e.clientY / window.innerHeight - 0.5) * 28
      schedule()
    }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('pointermove', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* animated aurora background (parallax on scroll + pointer) */}
      <div ref={auroraRef} className="pointer-events-none fixed inset-0 -z-10 will-change-transform">
        <div className="aurora aurora-1" />
        <div className="aurora aurora-2" />
        <div className="aurora aurora-3" />
      </div>

      {/* nav */}
      <header className="sticky top-0 z-40 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <span className="text-xl font-extrabold tracking-tight text-glow">
            MARTE<span className="text-primary">LOUNGE</span>
          </span>
          <div className="flex items-center gap-2">
            <a href="#contact" className="hidden px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-primary sm:block">
              კონტაქტი
            </a>
            <a href="/app" className="px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-primary">
              შესვლა
            </a>
            <a href="/app" className="nm-btn rounded-xl px-4 py-2 text-sm font-bold text-primary">
              დაიწყე უფასოდ
            </a>
          </div>
        </div>
      </header>

      {/* hero — interactive Digital Twin */}
      <Hero />

      {/* features */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-16">
        <Reveal>
          <h2 className="text-center text-3xl font-extrabold tracking-tight">ყველაფერი ერთ პანელში</h2>
          <p className="mt-2 text-center text-muted-foreground">8 მოდული, რომელიც კლუბს ნამდვილ ბიზნესად აქცევს</p>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.t} delay={(i % 4) * 80}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className="group relative h-full overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-[var(--surface-2)] to-[var(--surface)] p-5"
              >
                {/* hover glow blob */}
                <div
                  className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-50"
                  style={{ background: f.from }}
                />
                {/* gradient icon tile */}
                <div
                  className="relative flex size-12 items-center justify-center rounded-2xl"
                  style={{ background: `linear-gradient(135deg, ${f.from}, ${f.to})`, boxShadow: `0 8px 26px ${f.from}55` }}
                >
                  <f.icon className="size-6 text-white drop-shadow" />
                </div>
                <h3 className="relative mt-4 font-bold">{f.t}</h3>
                <p className="relative mt-1.5 text-sm text-muted-foreground">{f.d}</p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <Reveal>
          <h2 className="text-center text-3xl font-extrabold tracking-tight">როგორ მუშაობს</h2>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 120}>
              <div className="nm-raised rounded-2xl p-6 text-center">
                <div className="nm-glow mx-auto flex size-14 items-center justify-center rounded-2xl text-2xl font-extrabold text-primary">
                  {s.n}
                </div>
                <h3 className="mt-4 font-bold">{s.t}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* marketplace */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <Reveal>
          <div className="nm-raised relative overflow-hidden rounded-3xl p-8 sm:p-12">
            <div className="relative z-10 max-w-xl">
              <span className="nm-raised-sm inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-primary">
                <Globe className="size-3.5" /> Marketplace
              </span>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight">
                შენი კლუბი <span className="text-primary">play.martelounge.ge</span>-ზე
              </h2>
              <p className="mt-3 text-muted-foreground">
                კლიენტები პოულობენ შენს კლუბს, ხედავენ ცოცხალ ხელმისაწვდომობას და ჯავშნიან online.
                მიიღე ჯავშანი ნებისმიერ მოდულზე — ზარის შეტყობინებით.
              </p>
              <div className="mt-5 flex flex-wrap gap-4 text-sm">
                <span className="flex items-center gap-2"><CalendarClock className="size-4 text-primary" /> ცოცხალი ხელმისაწვდომობა</span>
                <span className="flex items-center gap-2"><QrCode className="size-4 text-primary" /> QR check-in</span>
                <span className="flex items-center gap-2"><Check className="size-4 text-primary" /> შეფასებები</span>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* pricing */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <Reveal>
          <h2 className="text-center text-3xl font-extrabold tracking-tight">ფასები</h2>
          <p className="mt-2 text-center text-muted-foreground">დაიწyე უფასოდ, გაიზარდე საჭიროებისამებრ</p>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 100}>
              <div className={`rounded-3xl p-6 ${p.highlight ? 'nm-glow' : 'nm-raised'}`}>
                <h3 className="text-lg font-bold">{p.name}</h3>
                <div className="mt-2">
                  <span className="text-4xl font-extrabold">{p.price}</span>
                  <span className="text-sm text-muted-foreground"> {p.sub}</span>
                </div>
                <ul className="mt-5 space-y-2 text-sm">
                  {p.feats.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className="size-4 shrink-0 text-primary" /> {f}
                    </li>
                  ))}
                </ul>
                <a href="/app" className={`mt-6 block rounded-xl py-3 text-center text-sm font-bold ${p.highlight ? 'nm-btn text-primary' : 'nm-btn text-muted-foreground'}`}>
                  {p.cta}
                </a>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* final CTA */}
      <section className="mx-auto max-w-4xl px-5 py-20 text-center">
        <Reveal>
          <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            მზად ხარ? <span className="text-primary text-glow">დაიწyე დღესვე</span>
          </h2>
          <p className="mt-4 text-muted-foreground">14 დღე უფასოდ. ბარათი არ სჭირდება.</p>
          <a href="/app" className="nm-glow mt-8 inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-lg font-bold">
            დაიწyე უფასოდ <ArrowRight className="size-5" />
          </a>
        </Reveal>
      </section>

      {/* digital pass / QR check-in showcase */}
      <section id="pass" className="mx-auto max-w-6xl px-5 py-16">
        <Reveal>
          <h2 className="text-center text-3xl font-extrabold tracking-tight">ციფრული პასი & QR check-in</h2>
          <p className="mt-2 text-center text-muted-foreground">
            ონლაინ ჯავშანი → კლიენტი მოდის QR-ით → ერთი სკანი და შემოსულია.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div className="mt-10">
            <DigitalPass />
          </div>
          <p className="text-center text-xs text-muted-foreground">კურსორი მიიტანე — ბარათი გადაბრუნდება</p>
        </Reveal>
      </section>

      {/* contact */}
      <section id="contact" className="mx-auto max-w-6xl px-5 py-16">
        <Reveal>
          <h2 className="text-center text-3xl font-extrabold tracking-tight">დაგვიკავშირდი</h2>
          <p className="mt-2 text-center text-muted-foreground">
            გაქვს კითხვა ან მზად ხარ დასაწყებად? ჩვენ აქ ვართ.
          </p>
        </Reveal>
        <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
          {CONTACTS.map((c, i) => (
            <Reveal key={c.t} delay={i * 80}>
              <motion.a
                href={c.href}
                target={c.href.startsWith('http') ? '_blank' : undefined}
                rel="noreferrer"
                whileHover={{ y: -6 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className="group relative flex h-full flex-col items-center gap-3 overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-[var(--surface-2)] to-[var(--surface)] p-6 text-center"
              >
                <div
                  className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-50"
                  style={{ background: c.from }}
                />
                <div
                  className="relative flex size-12 items-center justify-center rounded-2xl"
                  style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})`, boxShadow: `0 8px 26px ${c.from}55` }}
                >
                  <c.icon className="size-6 text-white drop-shadow" />
                </div>
                <h3 className="relative font-bold">{c.t}</h3>
                <p className="relative text-sm text-muted-foreground">{c.v}</p>
              </motion.a>
            </Reveal>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row">
          <span className="font-bold text-foreground">MARTELOUNGE</span>
          <span>© {new Date().getFullYear()} · PlayStation კლუბების ოპერაციული სისტემა</span>
          <div className="flex items-center gap-4">
            <a href="tel:+995500057527" className="transition-colors hover:text-primary">+995 500 05-75-27</a>
            <a href="/app" className="text-primary">შესვლა →</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
