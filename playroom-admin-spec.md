# Playroom Admin Panel — სრული სპეციფიკაცია

> **პროექტი:** PS5 Playroom Manager  
> **სტეკი:** Vite + React + TypeScript + Supabase + Tailwind CSS  
> **მიზანი:** PS5 playroom-ის სრული ადმინ პანელი — სესიების მართვა, კასა, ტარიფები, თანამშრომლები

---

## 1. პროექტის მიმოხილვა

Playroom-ში არის **4 Sony PlayStation 5** კონსოლი. ადმინ პანელს უნდა შეეძლოს:

- კონკრეტული კონსოლის სესიის დაწყება (ადგილის ნომერი + ხანგრძლივობა)
- Countdown timer — ავტომატური შეტყობინება **10 წთ ადრე**, **5 წთ ადრე**, **დრო ამოიწურა**
- სესიის გაგრძელება (extension) პირდაპირ პანელიდან
- **2 ტარიფი:** სტანდარტი (2 ჯოისტიკი) და პრემიუმი (4 ჯოისტიკი) — განსხვავებული ფასი
- ფასების მართვა ადმინ პანელიდან — ცვლილება მხოლოდ მომავალ სესიებზე ვრცელდება
- სესიების სრული ისტორია
- **კასა** — თითოეული კონსოლის დღის შემოსავალი + ყველა კონსოლი ერთად (დღე / კვირა / თვე / სულ)
- **თანამშრომლების სია** — PIN-ით Clock In / Clock Out, ცვლების ჟურნალი

---

## 2. Database Schema (Supabase / PostgreSQL)

### 2.1 `pricing_plans` — ტარიფები

```sql
CREATE TABLE pricing_plans (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,          -- "სტანდარტი", "პრემიუმი", "VIP"
  type            VARCHAR(50) NOT NULL,            -- "standard" | "premium"
  controllers     INT NOT NULL DEFAULT 2,          -- 2 ან 4 ჯოისტიკი
  price_per_hour  DECIMAL(10,2) NOT NULL,          -- ₾5.00, ₾8.00...
  is_active       BOOLEAN DEFAULT TRUE,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- საწყისი მონაცემები
INSERT INTO pricing_plans (name, type, controllers, price_per_hour) VALUES
  ('სტანდარტი', 'standard', 2, 5.00),
  ('პრემიუმი',  'premium',  4, 8.00);
```

**ლოგიკა:** ფასის შეცვლისას `updated_at` განახლდება. მიმდინარე სესიები ძველ ფასს ინარჩუნებენ, რადგან `price_total` სესიის შექმნისას ითვლება და ინახება.

---

### 2.2 `consoles` — კონსოლები

```sql
CREATE TABLE consoles (
  id           SERIAL PRIMARY KEY,
  slot_number  INT NOT NULL UNIQUE,    -- 1, 2, 3, 4
  name         VARCHAR(50) NOT NULL,   -- "PS5 #1", "PS5 #2"...
  status       VARCHAR(20) DEFAULT 'free',
  -- status values: 'free' | 'active' | 'warning_10' | 'warning_5' | 'expired'
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO consoles (slot_number, name) VALUES
  (1, 'PS5 #1'), (2, 'PS5 #2'), (3, 'PS5 #3'), (4, 'PS5 #4');
```

---

### 2.3 `sessions` — სესიები

```sql
CREATE TABLE sessions (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  console_id       INT REFERENCES consoles(id) NOT NULL,
  pricing_plan_id  INT REFERENCES pricing_plans(id) NOT NULL,
  customer_name    VARCHAR(100),                       -- სურვილისამებრ
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  ends_at          TIMESTAMPTZ NOT NULL,               -- started_at + duration
  ended_at         TIMESTAMPTZ,                        -- რეალური დასასრული
  duration_min     INT NOT NULL,                       -- 60, 90, 120...
  price_per_hour   DECIMAL(10,2) NOT NULL,             -- snapshot ტარიფიდან
  price_total      DECIMAL(10,2) NOT NULL,             -- (duration_min/60) * price_per_hour
  status           VARCHAR(20) DEFAULT 'active',
  -- status values: 'active' | 'completed' | 'cancelled'
  notified_10      BOOLEAN DEFAULT FALSE,
  notified_5       BOOLEAN DEFAULT FALSE,
  created_by       INT REFERENCES employees(id),       -- ვინ გახსნა სესია
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

**ფასის გაანგარიშება სესიის გახსნისას:**
```
price_total = ROUND((duration_min / 60.0) * price_per_hour, 2)
```

---

### 2.4 `session_extensions` — სესიის გაგრძელება

```sql
CREATE TABLE session_extensions (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id     UUID REFERENCES sessions(id) NOT NULL,
  extra_minutes  INT NOT NULL,              -- 30, 60...
  extra_price    DECIMAL(10,2) NOT NULL,    -- (extra_minutes/60) * price_per_hour
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
```

გაგრძელებისას `sessions.ends_at` განახლდება: `ends_at = ends_at + extra_minutes * interval '1 minute'`

---

### 2.5 `employees` — თანამშრომლები

```sql
CREATE TABLE employees (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  pin        VARCHAR(6) NOT NULL UNIQUE,   -- 4-6 ციფრიანი PIN (hashed)
  role       VARCHAR(20) DEFAULT 'operator',
  -- role values: 'admin' | 'operator'
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 2.6 `shifts` — ცვლები (Clock In / Clock Out)

```sql
CREATE TABLE shifts (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id  INT REFERENCES employees(id) NOT NULL,
  clock_in     TIMESTAMPTZ DEFAULT NOW(),
  clock_out    TIMESTAMPTZ,                  -- NULL სანამ არ გავა
  hours_worked DECIMAL(5,2),                 -- ავტო: (clock_out - clock_in) საათებში
  work_date    DATE DEFAULT CURRENT_DATE,    -- index-ისთვის
  notes        TEXT
);

-- ავტომატური hours_worked გაანგარიშება clock_out-ზე
CREATE OR REPLACE FUNCTION calc_hours_worked()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.clock_out IS NOT NULL AND OLD.clock_out IS NULL THEN
    NEW.hours_worked := ROUND(
      EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600.0,
      2
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hours_worked
  BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION calc_hours_worked();
```

---

### 2.7 SQL Views — კასის გაანგარიშება

#### კონსოლის სტატისტიკა
```sql
CREATE VIEW console_stats AS
SELECT
  c.id,
  c.name,
  c.slot_number,
  c.status,
  COUNT(s.id)                                    AS total_sessions,
  ROUND(SUM(s.duration_min) / 60.0, 1)          AS total_hours,
  COALESCE(SUM(s.price_total), 0) +
    COALESCE((
      SELECT SUM(se.extra_price)
      FROM session_extensions se
      JOIN sessions s2 ON se.session_id = s2.id
      WHERE s2.console_id = c.id
    ), 0)                                         AS total_revenue
FROM consoles c
LEFT JOIN sessions s ON s.console_id = c.id AND s.status = 'completed'
GROUP BY c.id, c.name, c.slot_number, c.status
ORDER BY c.slot_number;
```

#### კასა — დღის შემოსავალი კონსოლების მიხედვით
```sql
CREATE VIEW daily_revenue AS
SELECT
  c.slot_number,
  c.name,
  COUNT(s.id)                           AS sessions_today,
  ROUND(SUM(s.duration_min)/60.0, 1)   AS hours_today,
  COALESCE(SUM(s.price_total), 0) +
    COALESCE(SUM(ext.extra_total), 0)   AS revenue_today
FROM consoles c
LEFT JOIN sessions s
  ON s.console_id = c.id
  AND s.status = 'completed'
  AND DATE(s.ended_at AT TIME ZONE 'Asia/Tbilisi') = CURRENT_DATE
LEFT JOIN LATERAL (
  SELECT session_id, SUM(extra_price) AS extra_total
  FROM session_extensions
  WHERE session_id = s.id
  GROUP BY session_id
) ext ON true
GROUP BY c.id, c.slot_number, c.name
ORDER BY c.slot_number;
```

#### კასა — პერიოდების მიხედვით (სულ)
```sql
CREATE VIEW period_revenue AS
SELECT
  SUM(CASE WHEN DATE(ended_at AT TIME ZONE 'Asia/Tbilisi') = CURRENT_DATE
    THEN price_total END)                                          AS today,
  SUM(CASE WHEN ended_at >= date_trunc('week', NOW())
    THEN price_total END)                                          AS this_week,
  SUM(CASE WHEN ended_at >= date_trunc('month', NOW())
    THEN price_total END)                                          AS this_month,
  SUM(price_total)                                                 AS all_time
FROM sessions
WHERE status = 'completed';
```

---

## 3. პროექტის სტრუქტურა

```
playroom-admin/
├── src/
│   ├── components/
│   │   ├── ConsoleCard.tsx          # ერთი PS5 ბარათი + countdown
│   │   ├── ConsoleGrid.tsx          # 4 კონსოლი ბადეში
│   │   ├── NewSessionModal.tsx      # სესიის გახსნა (ტარიფი + ხანგრძლივობა)
│   │   ├── ExtendSessionModal.tsx   # სესიის გაგრძელება
│   │   ├── NotificationToast.tsx    # 10წთ / 5წთ / ამოიწურა
│   │   └── TimerDisplay.tsx        # MM:SS countdown
│   ├── pages/
│   │   ├── Dashboard.tsx           # მთავარი ეკრანი — ყველა კონსოლი
│   │   ├── Cashier.tsx             # კასის ეკრანი
│   │   ├── History.tsx             # სესიების ისტორია
│   │   └── Settings.tsx            # ტარიფები + თანამშრომლები
│   ├── hooks/
│   │   ├── useConsoles.ts          # Supabase Realtime — კონსოლების სტატუსი
│   │   ├── useSessions.ts          # სესიების CRUD
│   │   ├── useTimers.ts            # ლოკალური countdown logics
│   │   └── useShifts.ts            # Clock in/out
│   ├── lib/
│   │   ├── supabase.ts             # Supabase client
│   │   └── notifications.ts       # Web Audio API შეტყობინებები
│   └── types/
│       └── index.ts                # TypeScript types
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql  # ყველა ცხრილი + views + triggers
│   └── functions/
│       └── check-timers/           # Edge Function — cron ყოველ წუთს
│           └── index.ts
└── package.json
```

---

## 4. TypeScript Types

```typescript
// src/types/index.ts

export type ConsoleStatus = 'free' | 'active' | 'warning_10' | 'warning_5' | 'expired';
export type SessionStatus = 'active' | 'completed' | 'cancelled';
export type EmployeeRole = 'admin' | 'operator';

export interface PricingPlan {
  id: number;
  name: string;
  type: 'standard' | 'premium';
  controllers: number;
  price_per_hour: number;
  is_active: boolean;
  updated_at: string;
}

export interface Console {
  id: number;
  slot_number: number;
  name: string;
  status: ConsoleStatus;
  created_at: string;
  // joined
  active_session?: Session;
}

export interface Session {
  id: string;
  console_id: number;
  pricing_plan_id: number;
  customer_name?: string;
  started_at: string;
  ends_at: string;
  ended_at?: string;
  duration_min: number;
  price_per_hour: number;
  price_total: number;
  status: SessionStatus;
  notified_10: boolean;
  notified_5: boolean;
  created_by?: number;
  created_at: string;
  // joined
  pricing_plan?: PricingPlan;
  extensions?: SessionExtension[];
}

export interface SessionExtension {
  id: string;
  session_id: string;
  extra_minutes: number;
  extra_price: number;
  created_at: string;
}

export interface Employee {
  id: number;
  name: string;
  pin: string;   // hashed, არ გამოჩნდება frontend-ზე
  role: EmployeeRole;
  is_active: boolean;
  created_at: string;
  // computed
  current_shift?: Shift;
}

export interface Shift {
  id: string;
  employee_id: number;
  clock_in: string;
  clock_out?: string;
  hours_worked?: number;
  work_date: string;
  notes?: string;
  // joined
  employee?: Employee;
}

export interface ConsoleStats {
  id: number;
  name: string;
  slot_number: number;
  status: ConsoleStatus;
  total_sessions: number;
  total_hours: number;
  total_revenue: number;
}

export interface DailyRevenue {
  slot_number: number;
  name: string;
  sessions_today: number;
  hours_today: number;
  revenue_today: number;
}

export interface PeriodRevenue {
  today: number;
  this_week: number;
  this_month: number;
  all_time: number;
}
```

---

## 5. Supabase Edge Function — Timer Check

```typescript
// supabase/functions/check-timers/index.ts
// cron: "* * * * *"  (ყოველ წუთს)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const now = new Date()

  const { data: sessions } = await supabase
    .from('sessions')
    .select('*, consoles(name, slot_number)')
    .eq('status', 'active')

  if (!sessions?.length) return new Response('ok')

  for (const session of sessions) {
    const endsAt = new Date(session.ends_at)
    const minutesLeft = (endsAt.getTime() - now.getTime()) / 60000

    // 10 წუთი ადრე
    if (minutesLeft <= 10 && minutesLeft > 9 && !session.notified_10) {
      await supabase.from('sessions')
        .update({ notified_10: true })
        .eq('id', session.id)

      await supabase.from('consoles')
        .update({ status: 'warning_10' })
        .eq('id', session.console_id)

      // Supabase Realtime channel push — frontend-ი ისმენს
      await supabase.channel('notifications').send({
        type: 'broadcast',
        event: 'timer_warning',
        payload: {
          console_name: session.consoles.name,
          minutes_left: 10,
          session_id: session.id
        }
      })
    }

    // 5 წუთი ადრე
    if (minutesLeft <= 5 && minutesLeft > 4 && !session.notified_5) {
      await supabase.from('sessions')
        .update({ notified_5: true })
        .eq('id', session.id)

      await supabase.from('consoles')
        .update({ status: 'warning_5' })
        .eq('id', session.console_id)

      await supabase.channel('notifications').send({
        type: 'broadcast',
        event: 'timer_warning',
        payload: {
          console_name: session.consoles.name,
          minutes_left: 5,
          session_id: session.id
        }
      })
    }

    // დრო ამოიწურა
    if (minutesLeft <= 0) {
      await supabase.from('sessions')
        .update({ status: 'completed', ended_at: now.toISOString() })
        .eq('id', session.id)

      await supabase.from('consoles')
        .update({ status: 'expired' })
        .eq('id', session.console_id)

      await supabase.channel('notifications').send({
        type: 'broadcast',
        event: 'session_expired',
        payload: {
          console_name: session.consoles.name,
          session_id: session.id
        }
      })
    }
  }

  return new Response('ok')
})
```

---

## 6. React Hooks

### useConsoles — Realtime სტატუსი

```typescript
// src/hooks/useConsoles.ts
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Console } from '../types'

export function useConsoles() {
  const [consoles, setConsoles] = useState<Console[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // პირველი ჩატვირთვა
    supabase
      .from('consoles')
      .select(`
        *,
        active_session:sessions(
          *,
          pricing_plan:pricing_plans(*),
          extensions:session_extensions(*)
        )
      `)
      .eq('sessions.status', 'active')
      .order('slot_number')
      .then(({ data }) => {
        setConsoles(data ?? [])
        setLoading(false)
      })

    // Realtime subscription
    const channel = supabase
      .channel('consoles-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'consoles'
      }, (payload) => {
        setConsoles(prev =>
          prev.map(c => c.id === (payload.new as Console).id
            ? { ...c, ...(payload.new as Console) }
            : c
          )
        )
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return { consoles, loading }
}
```

### useNotifications — ხმოვანი შეტყობინებები

```typescript
// src/hooks/useNotifications.ts
import { useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useNotifications() {
  const playSound = useCallback((type: 'warning' | 'expired') => {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new AudioCtx()
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    if (type === 'warning') {
      oscillator.frequency.value = 880
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.5)
    } else {
      // expired — 3 ბიპი
      [0, 0.3, 0.6].forEach(offset => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 440
        gain.gain.setValueAtTime(0.4, ctx.currentTime + offset)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + offset + 0.2)
        osc.start(ctx.currentTime + offset)
        osc.stop(ctx.currentTime + offset + 0.2)
      })
    }
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('notifications')
      .on('broadcast', { event: 'timer_warning' }, ({ payload }) => {
        playSound('warning')
        // Toast notification გამოჩნდება
        showToast({
          type: payload.minutes_left === 10 ? 'warning' : 'danger',
          message: `${payload.console_name} — ${payload.minutes_left} წუთი დარჩა!`
        })
      })
      .on('broadcast', { event: 'session_expired' }, ({ payload }) => {
        playSound('expired')
        showToast({
          type: 'expired',
          message: `${payload.console_name} — დრო ამოიწურა!`
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [playSound])
}

function showToast(opts: { type: string; message: string }) {
  // Toast implementation — react-hot-toast ან custom
  console.log('TOAST:', opts)
}
```

---

## 7. Session Management — Core Logic

```typescript
// src/lib/sessions.ts

import { supabase } from './supabase'
import type { PricingPlan } from '../types'

// სესიის გახსნა
export async function startSession(params: {
  console_id: number
  pricing_plan_id: number
  duration_min: number
  customer_name?: string
  created_by?: number
}) {
  const { data: plan } = await supabase
    .from('pricing_plans')
    .select('price_per_hour')
    .eq('id', params.pricing_plan_id)
    .single()

  if (!plan) throw new Error('ტარიფი ვერ მოიძებნა')

  const now = new Date()
  const ends_at = new Date(now.getTime() + params.duration_min * 60000)
  const price_total = parseFloat(
    ((params.duration_min / 60) * plan.price_per_hour).toFixed(2)
  )

  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      console_id:      params.console_id,
      pricing_plan_id: params.pricing_plan_id,
      customer_name:   params.customer_name,
      duration_min:    params.duration_min,
      ends_at:         ends_at.toISOString(),
      price_per_hour:  plan.price_per_hour,
      price_total,
      created_by:      params.created_by
    })
    .select()
    .single()

  if (error) throw error

  // კონსოლის სტატუსი → active
  await supabase
    .from('consoles')
    .update({ status: 'active' })
    .eq('id', params.console_id)

  return session
}

// სესიის გაგრძელება
export async function extendSession(session_id: string, extra_minutes: number) {
  const { data: session } = await supabase
    .from('sessions')
    .select('ends_at, price_per_hour')
    .eq('id', session_id)
    .single()

  if (!session) throw new Error('სესია ვერ მოიძებნა')

  const extra_price = parseFloat(
    ((extra_minutes / 60) * session.price_per_hour).toFixed(2)
  )
  const new_ends_at = new Date(
    new Date(session.ends_at).getTime() + extra_minutes * 60000
  )

  await supabase.from('session_extensions').insert({
    session_id,
    extra_minutes,
    extra_price
  })

  await supabase
    .from('sessions')
    .update({ ends_at: new_ends_at.toISOString() })
    .eq('id', session_id)
}

// სესიის ადრე დასრულება
export async function endSessionEarly(session_id: string, console_id: number) {
  const now = new Date().toISOString()

  await supabase
    .from('sessions')
    .update({ status: 'completed', ended_at: now })
    .eq('id', session_id)

  await supabase
    .from('consoles')
    .update({ status: 'free' })
    .eq('id', console_id)
}
```

---

## 8. Clock In / Clock Out Logic

```typescript
// src/lib/shifts.ts

import { supabase } from './supabase'
import bcrypt from 'bcryptjs' // ან Supabase-ის pgcrypto

// PIN-ით შემოსვლა
export async function clockIn(pin: string): Promise<{ success: boolean; employee_name?: string; error?: string }> {
  const { data: employees } = await supabase
    .from('employees')
    .select('id, name, pin')
    .eq('is_active', true)

  // PIN შედარება (bcrypt)
  const employee = employees?.find(e => bcrypt.compareSync(pin, e.pin))

  if (!employee) return { success: false, error: 'PIN არასწორია' }

  // შევამოწმოთ არ არის უკვე ჩარეგისტრირებული
  const { data: activeShift } = await supabase
    .from('shifts')
    .select('id')
    .eq('employee_id', employee.id)
    .is('clock_out', null)
    .single()

  if (activeShift) return { success: false, error: 'უკვე ჩარეგისტრირებული ხართ' }

  await supabase.from('shifts').insert({ employee_id: employee.id })

  return { success: true, employee_name: employee.name }
}

// PIN-ით გასვლა
export async function clockOut(pin: string): Promise<{ success: boolean; hours_worked?: number; error?: string }> {
  const { data: employees } = await supabase
    .from('employees')
    .select('id, name, pin')
    .eq('is_active', true)

  const employee = employees?.find(e => bcrypt.compareSync(pin, e.pin))

  if (!employee) return { success: false, error: 'PIN არასწორია' }

  const { data: activeShift } = await supabase
    .from('shifts')
    .select('id, clock_in')
    .eq('employee_id', employee.id)
    .is('clock_out', null)
    .single()

  if (!activeShift) return { success: false, error: 'შემოსვლა ვერ მოიძებნა' }

  const now = new Date()
  const hours_worked = parseFloat(
    ((now.getTime() - new Date(activeShift.clock_in).getTime()) / 3600000).toFixed(2)
  )

  await supabase
    .from('shifts')
    .update({ clock_out: now.toISOString() })
    .eq('id', activeShift.id)
  // hours_worked ავტომატურად ჩაიწერება trigger-ით

  return { success: true, hours_worked }
}
```

---

## 9. კასის ეკრანი — React Component

```typescript
// src/pages/Cashier.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DailyRevenue, PeriodRevenue, ConsoleStats } from '../types'

export default function Cashier() {
  const [period, setPeriod] = useState<PeriodRevenue | null>(null)
  const [daily, setDaily] = useState<DailyRevenue[]>([])
  const [stats, setStats] = useState<ConsoleStats[]>([])

  useEffect(() => {
    // პერიოდული შემოსავალი
    supabase.from('period_revenue').select('*').single()
      .then(({ data }) => setPeriod(data))

    // დღის შემოსავალი კონსოლების მიხედვით
    supabase.from('daily_revenue').select('*')
      .then(({ data }) => setDaily(data ?? []))

    // სრული სტატისტიკა
    supabase.from('console_stats').select('*')
      .then(({ data }) => setStats(data ?? []))
  }, [])

  const totalToday = daily.reduce((sum, d) => sum + Number(d.revenue_today), 0)

  return (
    <div>
      {/* პერიოდული Summary */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <MetricCard label="კასა დღეს"     value={`₾${totalToday.toFixed(2)}`} />
        <MetricCard label="ეს კვირა"      value={`₾${period?.this_week?.toFixed(2) ?? '—'}`} />
        <MetricCard label="ეს თვე"        value={`₾${period?.this_month?.toFixed(2) ?? '—'}`} />
        <MetricCard label="სულ ყველა დრო" value={`₾${period?.all_time?.toFixed(2) ?? '—'}`} />
      </div>

      {/* დღის შემოსავალი კონსოლების მიხედვით */}
      <table>
        <thead>
          <tr><th>კონსოლი</th><th>სესიები</th><th>საათები</th><th>შემოსავალი</th></tr>
        </thead>
        <tbody>
          {daily.map(d => (
            <tr key={d.slot_number}>
              <td>{d.name}</td>
              <td>{d.sessions_today}</td>
              <td>{d.hours_today} სთ</td>
              <td>₾{Number(d.revenue_today).toFixed(2)}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td>სულ</td>
            <td>{daily.reduce((s, d) => s + d.sessions_today, 0)}</td>
            <td>{daily.reduce((s, d) => s + Number(d.hours_today), 0).toFixed(1)} სთ</td>
            <td>₾{totalToday.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
```

---

## 10. ტარიფების მართვა — Admin Panel

```typescript
// src/components/PricingManager.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { PricingPlan } from '../types'

export default function PricingManager() {
  const [plans, setPlans] = useState<PricingPlan[]>([])

  useEffect(() => {
    supabase.from('pricing_plans').select('*').order('id')
      .then(({ data }) => setPlans(data ?? []))
  }, [])

  const updatePrice = async (id: number, newPrice: number) => {
    await supabase
      .from('pricing_plans')
      .update({ price_per_hour: newPrice, updated_at: new Date().toISOString() })
      .eq('id', id)

    setPlans(prev => prev.map(p => p.id === id ? { ...p, price_per_hour: newPrice } : p))
    // Toast: "ტარიფი განახლდა — ახალი სესიებიდან ძალაში შედის"
  }

  const toggleActive = async (id: number, current: boolean) => {
    await supabase
      .from('pricing_plans')
      .update({ is_active: !current })
      .eq('id', id)

    setPlans(prev => prev.map(p => p.id === id ? { ...p, is_active: !current } : p))
  }

  return (
    <div>
      {plans.map(plan => (
        <div key={plan.id}>
          <span>{plan.name}</span>
          <span>{plan.controllers} ჯოისტ.</span>
          <input
            type="number"
            value={plan.price_per_hour}
            step="0.5"
            min="0.5"
            onBlur={e => updatePrice(plan.id, parseFloat(e.target.value))}
          />
          <button onClick={() => toggleActive(plan.id, plan.is_active)}>
            {plan.is_active ? 'გამორთვა' : 'ჩართვა'}
          </button>
        </div>
      ))}
    </div>
  )
}
```

---

## 11. Supabase RLS Policies

```sql
-- RLS ჩართვა ყველა ცხრილზე
ALTER TABLE consoles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_extensions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees           ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts              ENABLE ROW LEVEL SECURITY;

-- authenticated მომხმარებლები — ყველაფრის წაკითხვა
CREATE POLICY "authenticated_read" ON consoles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read" ON sessions
  FOR SELECT TO authenticated USING (true);

-- employees ცხრილი — PIN არ გამოჩნდეს frontend-ზე
CREATE POLICY "hide_pin" ON employees
  FOR SELECT TO authenticated
  USING (true)
  WITH CHECK (false);  -- pin ველი mask-ია application layer-ზე

-- pricing_plans — admin-ს შეუძლია ჩასწოროს
CREATE POLICY "admin_update_pricing" ON pricing_plans
  FOR UPDATE TO authenticated USING (true);

-- shifts — ყველამ შეიძლება საკუთარი ჩაწეროს
CREATE POLICY "insert_own_shift" ON shifts
  FOR INSERT TO authenticated WITH CHECK (true);
```

---

## 12. Console Status — ფერადი კოდირება (UI)

| სტატუსი      | ფერი       | მნიშვნელობა                     |
|-------------|-----------|--------------------------------|
| `free`      | მწვანე    | კონსოლი თავისუფალია             |
| `active`    | ლურჯი     | სესია მიმდინარეობს              |
| `warning_10`| ყვითელი   | 10 წუთი დარჩა                   |
| `warning_5` | ნარინჯისფ.| 5 წუთი დარჩა                    |
| `expired`   | წითელი    | დრო ამოიწურა, დასუფთავება ელოდება|

---

## 13. Session Pricing — ლოგიკა სრულად

**ტარიფის არჩევა სესიის გახსნისას:**

```
სტანდარტი (2 ჯოისტიკი):  price_per_hour = pricing_plans.price_per_hour WHERE type='standard'
პრემიუმი  (4 ჯოისტიკი):  price_per_hour = pricing_plans.price_per_hour WHERE type='premium'
```

**ფასის გაანგარიშება:**

```
price_total = ROUND((duration_min / 60.0) * price_per_hour, 2)

მაგ. 90 წთ × ₾5/სთ = ROUND(1.5 × 5, 2) = ₾7.50
მაგ. 60 წთ × ₾8/სთ = ROUND(1.0 × 8, 2) = ₾8.00
```

**გაგრძელება:**

```
extra_price = ROUND((extra_minutes / 60.0) * price_per_hour, 2)
new_ends_at = old_ends_at + extra_minutes
total_paid  = price_total + SUM(all extra_prices)
```

**მნიშვნელოვანი:** `price_per_hour` სესიის ჩანაწერში ინახება შექმნის მომენტში — ანუ თუ ადმინი შემდეგ ტარიფს შეცვლის, ძველი სესიები სწორ ფასს ინარჩუნებენ.

---

## 14. Shifts — თანამშრომლების ცვლა

**Clock In პროცესი:**
1. ეკრანზე PIN ველი
2. PIN შემოდის → bcrypt.compare(pin, employee.pin)
3. თუ სწორია → `shifts` ცხრილში ახალი ჩანაწერი `clock_in = NOW()`
4. Toast: "გამარჯობა, [სახელი]! კარგ ცვლას გისურვებ"

**Clock Out პროცესი:**
1. PIN შემოდის
2. ეძებს უახლეს ღია shift-ს (`clock_out IS NULL`)
3. ჩაწერს `clock_out = NOW()`
4. Trigger ავტომატურად ითვლის `hours_worked`
5. Toast: "ნახვამდის, [სახელი]! დამუშავდა X.XX სთ"

**ცვლების ჟურნალი (Shifts page):**
```sql
SELECT
  e.name,
  s.clock_in,
  s.clock_out,
  s.hours_worked,
  s.work_date
FROM shifts s
JOIN employees e ON s.employee_id = e.id
WHERE s.work_date >= :from_date AND s.work_date <= :to_date
ORDER BY s.clock_in DESC;
```

---

## 15. გამართვის პრიორიტეტები (Build Order)

### ეტაპი 1 — MVP (1 კვირა)
1. Supabase schema + migrations
2. Dashboard — კონსოლების grid + სტატუსი
3. სესიის გახსნა (NewSessionModal) — ტარიფის არჩევა + ხანგრძლივობა
4. Countdown timer (frontend-side) + 3 შეტყობინება
5. სესიის გაგრძელება (ExtendSessionModal)
6. კასის ეკრანი — დღის summary

### ეტაპი 2 — სრული სისტემა (კვირა 2)
1. სესიების ისტორია — ფილტრი, ძიება
2. ტარიფების მართვა (admin)
3. თანამშრომლები + Clock In/Out (PIN-ით)
4. ცვლების ჟურნალი

### ეტაპი 3 — ანალიტიკა (კვირა 3)
1. კონსოლის სრული სტატისტიკა (total_hours, total_revenue)
2. გრაფიკები — recharts-ით
3. Peak hours ანალიზი
4. CSV Export

---

## 16. Environment Variables

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...

# Edge Functions-ისთვის (Supabase Dashboard-ში)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

---

## 17. Package.json Dependencies

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.x",
    "react": "^18.x",
    "react-dom": "^18.x",
    "react-router-dom": "^6.x",
    "tailwindcss": "^3.x",
    "recharts": "^2.x",
    "react-hot-toast": "^2.x",
    "date-fns": "^3.x",
    "bcryptjs": "^2.x"
  },
  "devDependencies": {
    "@types/react": "^18.x",
    "@types/bcryptjs": "^2.x",
    "typescript": "^5.x",
    "vite": "^5.x",
    "@vitejs/plugin-react": "^4.x"
  }
}
```

---

*დოკუმენტი: Playroom Admin Panel v1.0 — 2026-06-05*  
*სტეკი: Vite + React + TypeScript + Supabase + Tailwind*
