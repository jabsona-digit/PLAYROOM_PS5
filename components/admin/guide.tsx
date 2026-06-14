'use client'

import { useState, useMemo } from 'react'
import {
  BookOpen,
  Search,
  Rocket,
  Gamepad2,
  Coffee,
  Wallet,
  Calculator,
  Users,
  Trophy,
  Settings,
  CreditCard,
  HelpCircle,
  Lightbulb,
  AlertTriangle,
  Info,
  Sparkles,
  ShieldAlert,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const CATEGORIES = [
  { id: 'start', title: '1. დაწყება', icon: Rocket },
  { id: 'sessions', title: '2. სესიები & კონსოლები', icon: Gamepad2 },
  { id: 'pos', title: '3. ბარი / POS', icon: Coffee },
  { id: 'cashier', title: '4. კასა (ცვლა)', icon: Wallet },
  { id: 'accounting', title: '5. ფული & ბუღალტერია', icon: Calculator },
  { id: 'team', title: '6. გუნდი & როლები', icon: Users },
  { id: 'customers', title: '7. კლიენტები, ჯავშნები, ტურნირები', icon: Trophy },
  { id: 'settings', title: '8. პარამეტრები & ფისკალი', icon: Settings },
  { id: 'billing', title: '9. გამოწერა & პლატფორმა', icon: CreditCard },
  { id: 'ai', title: '10. AI ფუნქციები', icon: Sparkles },
  { id: 'faq', title: '11. ხშირი კითხვები (FAQ)', icon: HelpCircle },
]

export function Guide() {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id)
  const [searchQuery, setSearchQuery] = useState('')

  const TOPICS = useMemo(() => [
    {
      category: 'start',
      title: 'რა არის Martelounge?',
      content: (
        <>
          <p className="mb-3">
            Martelounge არის gaming-lounge-ის სრული მართვის სისტემა. ის აერთიანებს სესიებს, ბარს, კასას, ბუღალტერიას, გუნდს, ჯავშნებსა და ტურნირებს ერთიან და დაცულ პლატფორმაზე.
          </p>
          <div
            className="rounded-2xl p-4 text-sm"
            style={{ background: 'color-mix(in oklch, var(--status-free) 12%, transparent)' }}
          >
            <div className="flex items-start gap-2">
              <Lightbulb className="size-5 shrink-0" style={{ color: 'var(--status-free)' }} />
              <p>
                <b>მთავარი (Dashboard):</b> ყველა კონსოლი ერთ ეკრანზე ჩანს. შეგიძლიათ მართოთ მათი სტატუსი (თავისუფალი/აქტიური/იწურება) და აკონტროლოთ მიმდინარე შემოსავალი რეალურ დროში.
              </p>
            </div>
          </div>
        </>
      ),
    },
    {
      category: 'start',
      title: 'შესვლა და რეგისტრაცია',
      content: (
        <p>
          სისტემაში შესვლა ხდება ელფოსტისა და პაროლის მეშვეობით. პირველი რეგისტრაციისას გაივლით მოკლე onboarding პროცესს, სადაც იქმნება თქვენი ორგანიზაცია და პირველი ფილიალი.
        </p>
      ),
    },
    {
      category: 'sessions',
      title: 'სესიის ტიპები: ფიქსირებული vs ღია',
      content: (
        <div className="space-y-3">
          <p>
            <b>ფიქსირებული სესია:</b> წინასწარ უთითებთ დროს (მაგ. 1 ან 2 საათი). დროის ამოწურვისას სესია სრულდება.
          </p>
          <p>
            <b>ღია სესია:</b> დრო ითვლება წინ, ხოლო თანხა ჯამდება დასასრულს — ნათამაშებ დროზე დაყრდნობით. თანხა მრგვალდება უახლოეს 5 წუთამდე.
          </p>
          <div
            className="rounded-2xl p-4 text-sm"
            style={{ background: 'color-mix(in oklch, var(--status-warning5) 12%, transparent)' }}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-5 shrink-0" style={{ color: 'var(--status-warning5)' }} />
              <p>
                <b>გაფრთხილება:</b> დავიწყებული ღია სესია 24 საათში ავტომატურად იხურება სისტემის მიერ.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      category: 'sessions',
      title: 'ტარიფები და კონსოლის ტიპები',
      content: (
        <div className="space-y-3">
          <p>
            ტარიფები პერსონალიზებადია: სტანდარტი (2 ჯოისტიკი, ₾5/სთ), Pro (3, ₾7), პრემიუმი (4, ₾8). ფასის ცვლილება მხოლოდ მომავალ სესიებზე მოქმედებს.
          </p>
          <p>
            კონსოლის ტიპები: PS5, კუპე ან VIP. თითოეულს აქვს ცალკე ტევადობა. თუ ტიპი სრულად დაკავებულია, walk-in სესიები იბლოკება ("console_reserved" სტატუსით).
          </p>
        </div>
      ),
    },
    {
      category: 'pos',
      title: 'პროდუქტების გაყიდვა',
      content: (
        <div className="space-y-3">
          <p>
            ბარის მოდულში იყიდება პროდუქტები მარაგებიდან. სწრაფი გაყიდვისთვის ირჩევთ პროდუქტს, რაოდენობას და იხდით.
          </p>
          <p>
            <b>გადახდის მეთოდები:</b> ნაღდი, ბარათი, გადარიცხვა. შეგიძლიათ მიუთითოთ ბანკი (TBC / BOG) და დაამატოთ tips. მნიშვნელოვანია: ბარის გაყიდვა შესაძლებელია პირდაპირ მიებას მიმდინარე სესიას.
          </p>
        </div>
      ),
    },
    {
      category: 'pos',
      title: 'In-Seat Ordering — QR პორტალი 🪑',
      content: (
        <div className="space-y-3">
          <p>
            თითო კონსოლზე გააკრავთ QR კოდს (იბეჭდება Settings-დან). სტუმარი ასკანერებს → ტელეფონში ეხსნება საჯარო პორტალი ლოგინის გარეშე: ხედავს ბარის მენიუს, სესიის ტაიმერს, აკეთებს შეკვეთას ან იძახებს ოპერატორს (ჯოისტიკის გამოცვლა / სტაფის გამოძახება).
          </p>
          <div
            className="rounded-2xl p-4 text-sm"
            style={{ background: 'color-mix(in oklch, var(--primary) 12%, transparent)' }}
          >
            <div className="flex items-start gap-2">
              <Info className="size-5 shrink-0" style={{ color: 'var(--primary)' }} />
              <p>
                <b>ოპერატორის Inbox:</b> შეკვეთა მაშინვე ჩნდება ეკრანის ქვედა-მარცხენა „🔔" პანელში ხმოვანი სიგნალით. ოპერატორი ასრულებს → ირჩევს გადახდას (ნაღდი/TBC/BOG) → ავტომატურად იჭრება ბარის გაყიდვა. ფასს <b>სერვერი ითვლის</b> — თანხა თვითნებურად არ ჩამოიჭრება.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      category: 'cashier',
      title: 'ცვლის გახსნა და დახურვა',
      content: (
        <div className="space-y-3">
          <p>
            მოლარე ხსნის ცვლას საწყისი ნაღდი ფულით და ხურავს საბოლოო ნაღდით.
          </p>
          <div
            className="rounded-2xl p-4 text-sm"
            style={{ background: 'color-mix(in oklch, var(--primary) 12%, transparent)' }}
          >
            <div className="flex items-start gap-2">
              <Info className="size-5 shrink-0" style={{ color: 'var(--primary)' }} />
              <p>
                <b>Z-report:</b> ცვლის დახურვისას სისტემა აგენერირებს რეპორტს და ამოწმებს სხვაობას (reconcile) პროგრამულად დათვლილ და რეალურად არსებულ ნაღდ ფულს შორის.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      category: 'accounting',
      title: 'მოგება-ზარალი (P&L)',
      content: (
        <div className="space-y-3">
          <p>
            სუფთა მოგება ითვლება შემდეგნაირად: სესიის შემოსავალი + ბარის შემოსავალი − დაბრუნებები − გაწეული ხარჯები = მოგება.
          </p>
          <p className="text-muted-foreground text-sm">
            შენიშვნა: Tips არ ითვლება კომპანიის შემოსავლად — ეს არის თანამშრომლის pass-through თანხა.
          </p>
        </div>
      ),
    },
    {
      category: 'accounting',
      title: 'ხარჯები და ექსპორტი',
      content: (
        <div className="space-y-3">
          <p>
            ხარჯები იყოფა კატეგორიებად (ქირა, ხელფასი, კომუნალური, მარაგები, მარკეტინგი, ტექმომსახურება, სხვა).
          </p>
          <p>
            შესაძლებელია გაწეული ვრცელი ხარჯების Excel-დან იმპორტი შაბლონის მეშვეობით. ასევე შეგიძლიათ სრული ფინანსური მონაცემების მრავალგვერდიანი Excel-ექსპორტი.
          </p>
          <p>
            ორგანიზაციისთვის ითვლება დღგ (18%), ბიუჯეტი (მიზანი vs ფაქტი) და შესაძლებელია ინვოისების გენერაცია დასაბეჭდად.
          </p>
        </div>
      ),
    },
    {
      category: 'team',
      title: 'როლები და წვდომა',
      content: (
        <ul className="list-disc pl-4 space-y-1">
          <li><b>owner / admin:</b> სრული წვდომა ყველაფერზე.</li>
          <li><b>manager:</b> ოპერაციები, ინვენტარი, ტურნირები.</li>
          <li><b>accountant:</b> მხოლოდ ბუღალტერია დასაანგარიშებლად.</li>
          <li><b>cashier:</b> კასა, ბარი, სესიები.</li>
          <li><b>operator:</b> მხოლოდ მიმდინარე სესიები და ბარის გაყიდვები.</li>
        </ul>
      ),
    },
    {
      category: 'team',
      title: 'თანამშრომლების მოწვევა და PIN',
      content: (
        <div className="space-y-3">
          <p>
            <b>მოწვევა:</b> Settings → გუნდი → email + როლი. იქმნება ბმული, რომლის მეშვეობითაც თანამშრომელი რეგისტრირდება და ავტომატურად უერთდება ორგანიზაციას შეზღუდული წვდომით.
          </p>
          <p>
            <b>PIN gate:</b> თუ ორგანიზაციას ჰყავს თანამშრომლები, საერთო ტერმინალი იკეტება. ოპერატორები შედიან PIN-ით. Owner/Admin იყენებს ღილაკს "მფლობელად შესვლა". (თუ ოპერატორი საკუთარი ლოგინით შევიდა, PIN არ სჭირდება).
          </p>
        </div>
      ),
    },
    {
      category: 'team',
      title: 'ხელფასები და აღრიცხვა',
      content: (
        <div className="space-y-3">
          <p>
            ხელფასი შეიძლება იყოს საათობრივი, თვიური ან ფიქსირებული. სესიის ან გაყიდვის შესრულებისას სისტემა იწერს, რომელმა ოპერატორმა შექმნა ჩანაწერი.
          </p>
          <div
            className="rounded-2xl p-4 text-sm"
            style={{ background: 'color-mix(in oklch, var(--primary) 12%, transparent)' }}
          >
            <div className="flex items-start gap-2">
              <Info className="size-5 shrink-0" style={{ color: 'var(--primary)' }} />
              <p>
                <b>ცვლების აღრიცხვა:</b> ოპერატორი/მოლარე შესვლისთანავე ავტომატურად ხსნის ცვლას. 16 საათში დავიწყებული ცვლა ავტომატურად იხურება. 
                "ხელფასების დარიცხვა" პირდაპირ აისახება ბუღალტერიის ხარჯებში.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      category: 'customers',
      title: 'ჯავშნები და ტურნირები',
      content: (
        <div className="space-y-3">
          <p>
            <b>ლოიალობა:</b> კლიენტებს აქვთ აღრიცხვა, ვიზიტები და ფასდაკლებები.
          </p>
          <p>
            <b>ჯავშნები:</b> შეგიძლიათ წინასწარ დაჯავშნოთ კონსოლი. martelounge.ge-დან ონლაინ ჯავშნები ტევადობაზეა დაფუძნებული, მოიცავს QR check-in-ს და კონსოლის ტიპის არჩევას.
          </p>
          <p>
            <b>ტურნირები:</b> Single-elimination PS5 ბადე. მოიცავს seed-ებს, power-of-2 გამოთვლებს, byes მოთამაშეებს და მოსახერხებელ TV-რეჟიმს ეკრანზე გამოსატანად.
          </p>
        </div>
      ),
    },
    {
      category: 'settings',
      title: 'პარამეტრები და ფისკალი (RS.GE)',
      content: (
        <div className="space-y-3">
          <p>
            ზოგადი პარამეტრები მოიცავს: სახელს, ვალუტას, 10/5 წუთიან გაფრთხილებებს და ხმოვან სიგნალებს. კონსოლების მართვა: დამატება, გადარქმევა და ტიპის შეცვლა. პარამეტრებიდან ასევე რეგულირდება martelounge.ge-ზე ფილიალის გამოქვეყნება.
          </p>
          <div
            className="rounded-2xl p-4 text-sm"
            style={{ background: 'color-mix(in oklch, var(--status-expired) 12%, transparent)' }}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-5 shrink-0" style={{ color: 'var(--status-expired)' }} />
              <p>
                <b>ფისკალი:</b> RS.GE Phase B-სთან ინტეგრაციისთვის აუცილებელია ს/ნ, ბიზნეს სახელი, მისამართი და დღგ სტატუსი. ჩეკის ნომრის ფორმატია: GE-YYYYMMDD-XXXXXX.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      category: 'settings',
      title: 'ონლაინ გადახდები (შენი merchant key) 💳',
      content: (
        <div className="space-y-3">
          <p>
            Settings → „ონლაინ გადახდები" — დააკავშირებთ თქვენს <b>საკუთარ</b> TBC ან BOG merchant account-ს. ონლაინ ჯავშნის თანხა პირდაპირ <b>თქვენს</b> ბანკში ჩაირიცხება — პლატფორმა ფულს არ ეხება.
          </p>
          <div
            className="rounded-2xl p-4 text-sm"
            style={{ background: 'color-mix(in oklch, var(--status-free) 12%, transparent)' }}
          >
            <div className="flex items-start gap-2">
              <ShieldAlert className="size-5 shrink-0" style={{ color: 'var(--status-free)' }} />
              <p>
                გასაღებები ინახება <b>დაშიფრულად</b> და ჩასმის შემდეგ აღარასდროს ჩანს ეკრანზე. ბარსა და walk-in სესიაში გადახდა ადგილზე ხდება (ნაღდი ან ფიზიკური POS ტერმინალი) — სისტემა მხოლოდ აღრიცხავს მეთოდს.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      category: 'billing',
      title: 'გამოწერა (SaaS)',
      content: (
        <p>
          გამოწერები: Trial (უფასო), PRO (₾45/თვე), ENTERPRISE (₾65/თვე). ანგარიშსწორება ამჟამად ხელით ხდება (WhatsApp/გადარიცხვა).
          SaaS მფლობელისთვის არსებობს პლატფორმის God Mode, სადაც ჩანს ყველა ორგანიზაციის MRR და გამოწერის სტატუსი.
        </p>
      ),
    },
    {
      category: 'ai',
      title: 'AI ასისტენტი (✨ ჩატი + ხმა)',
      content: (
        <div className="space-y-3">
          <p>
            ეკრანის კუთხეში მცურავი ✨ ღილაკი ხსნის AI ასისტენტს (Gemini). მიწერთ ან ეტყვით ხმით (ქართულად): „რამდენი გამოვიმუშავე დღეს?", „დაიწყე სესია TV 3-ზე", „გაყიდე 2 Red Bull".
          </p>
          <div
            className="rounded-2xl p-4 text-sm"
            style={{ background: 'color-mix(in oklch, var(--primary) 12%, transparent)' }}
          >
            <div className="flex items-start gap-2">
              <Info className="size-5 shrink-0" style={{ color: 'var(--primary)' }} />
              <p>
                <b>უსაფრთხო:</b> ასისტენტი მუშაობს <b>თქვენივე უფლებებით</b> — ვერაფერს ხედავს ან აკეთებს იმაზე მეტს, რასაც თქვენ თვითონ. ნებისმიერი ცვლილება (სესია/გაყიდვა) ჯერ <b>დასადასტურებლად</b> გამოგიჩნდებათ.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      category: 'ai',
      title: 'ჩეკის სკანერი (OCR) 📸',
      content: (
        <p>
          ბუღალტერიაში ხარჯის დამატებისას დააჭირეთ „ჩეკის სკანირებას" → გადაუღეთ ფიზიკურ ჩეკს → AI ამოიკითხავს თანხას, თარიღსა და კატეგორიას და ავტომატურად შეავსებს ფორმას. ხელით აკრეფა აღარ გჭირდებათ.
        </p>
      ),
    },
    {
      category: 'ai',
      title: 'AI ანტი-თაღლითობა & Trust Score 🕵️',
      content: (
        <div className="space-y-3">
          <p>
            ისტორიაში → ჩანართი „🕵️ AI აუდიტი". აირჩევთ პერიოდს და AI გაასკანერებს ჟურნალებს (გაუქმებები, დაბრუნებები, ბარის void-ები, ხარჯის წაშლები) → მოგცემთ ფორენზიკულ ანგარიშს ქართულად და თითო ოპერატორის <b>ნდობის ინდექსს (Trust Score)</b>.
          </p>
          <div
            className="rounded-2xl p-4 text-sm"
            style={{ background: 'color-mix(in oklch, var(--status-warning5) 12%, transparent)' }}
          >
            <div className="flex items-start gap-2">
              <ShieldAlert className="size-5 shrink-0" style={{ color: 'var(--status-warning5)' }} />
              <p>
                მაგ: „ოპერატორმა X დღეს 4 ბარის გაყიდვა გააუქმა — საშუალოზე 500%-ით მეტი". ერთი თაღლითობის დაჭერა პროგრამის საფასურს ამართლებს.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      category: 'faq',
      title: '"ტერმინალი დაბლოკილია / PIN მთხოვს"',
      content: (
        <p>
          როდესაც ორგანიზაციას ჰყავს დამატებული თანამშრომლები, სისტემა იცავს საერთო მოწყობილობას. Owner-ი აჭერს "მფლობელად შესვლას", ხოლო ოპერატორი კრეფს თავის პირად PIN-ს.
        </p>
      ),
    },
    {
      category: 'faq',
      title: '"ორი ოპერატორი ერთდროულად მუშაობაში"',
      content: (
        <p>
          სრულად შესაძლებელია. ყველა მუშაობს საერთო real-time დაფაზე, ხოლო მონაცემთა ბაზა ავტომატურად იცავს ორმაგ ქმედებას (concurrency).
        </p>
      ),
    },
    {
      category: 'faq',
      title: '"სესია დამავიწყდა დავხურო"',
      content: (
        <p>
          ნუ იდარდებთ, უყურადღებოდ დატოვებული ღია სესია ზუსტად 24 საათში ავტომატურად დაიხურება.
        </p>
      ),
    },
  ], [])

  // With a query, search across ALL categories (a handbook is searched globally);
  // with no query, show the selected category.
  const q = searchQuery.trim().toLowerCase()
  const filteredTopics = TOPICS.filter((t) =>
    q ? t.title.toLowerCase().includes(q) : t.category === activeCategory,
  )

  return (
    <div className="flex min-h-dvh flex-col md:flex-row gap-6 pb-24 md:pb-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Sidebar Categories */}
      <div className="w-full shrink-0 md:w-64 space-y-4">
        {/* Search Input */}
        <label className="nm-inset flex items-center gap-2 rounded-2xl px-4 py-3 shadow-inner transition-colors focus-within:ring-2 focus-within:ring-primary/20">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            placeholder="ძიება..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </label>

        {/* Categories Box */}
        <div className="nm-inset flex flex-col gap-1.5 rounded-[2rem] p-3 shadow-inner hidden md:flex">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id)
                setSearchQuery('')
              }}
              className={cn(
                'flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition-all',
                activeCategory === cat.id
                  ? 'nm-daylight text-primary shadow-sm'
                  : 'hover:text-foreground text-muted-foreground/80'
              )}
            >
              <cat.icon
                className={cn(
                  'size-5 shrink-0',
                  activeCategory === cat.id ? 'drop-shadow-[0_0_8px_var(--primary)]' : ''
                )}
              />
              <span className="truncate">{cat.title}</span>
            </button>
          ))}
        </div>

        {/* Mobile Accordion Style Category Selector */}
        <div className="md:hidden flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id)
                setSearchQuery('')
              }}
              className={cn(
                'flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold transition-all',
                activeCategory === cat.id
                  ? 'nm-daylight text-primary shadow-sm'
                  : 'nm-inset text-muted-foreground/80 shadow-inner'
              )}
            >
              <cat.icon className="size-4 shrink-0" />
              <span className="truncate">{cat.title.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 space-y-6">
        <div className="nm-raised rounded-3xl p-6 mb-6">
          <div className="flex items-center gap-4 border-b border-[var(--border)] pb-6 mb-6 opacity-80">
            <div className="nm-inset flex size-12 shrink-0 items-center justify-center rounded-2xl text-primary shadow-inner">
              <BookOpen className="size-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">სახელმძღვანელო</h2>
              <p className="text-sm text-muted-foreground">სრული გზამკვლევი სისტემის პროცესებზე</p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-1">
            {filteredTopics.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Search className="size-8 mb-3 opacity-20" />
                <p className="text-sm font-semibold">მონაცემები ვერ მოიძებნა</p>
              </div>
            ) : (
              filteredTopics.map((topic, i) => {
                const CatIcon = CATEGORIES.find((c) => c.id === topic.category)?.icon || BookOpen
                return (
                  <div key={i} className="nm-inset rounded-2xl p-5 sm:p-6 flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="nm-raised-sm flex size-10 shrink-0 items-center justify-center rounded-xl text-[var(--foreground)]">
                        <CatIcon className="size-5" />
                      </div>
                      <h3 className="text-base font-extrabold tracking-tight leading-tight">
                        {topic.title}
                      </h3>
                    </div>
                    <div className="text-sm leading-relaxed text-muted-foreground">
                      {topic.content}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
