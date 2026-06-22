'use client'

import { useState, useMemo } from 'react'
import {
  BookOpen,
  BarChart3,
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
  Plug,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const CATEGORIES = [
  { id: 'start', title: '1. დაწყება', icon: Rocket },
  { id: 'sessions', title: '2. სესიები & კონსოლები', icon: Gamepad2 },
  { id: 'pos', title: '3. ბარი / POS', icon: Coffee },
  { id: 'cashier', title: '4. კასა (ცვლა)', icon: Wallet },
  { id: 'accounting', title: '5. ფული & ბუღალტერია', icon: Calculator },
  { id: 'analytics', title: '6. ანალიტიკა', icon: BarChart3 },
  { id: 'team', title: '7. გუნდი & როლები', icon: Users },
  { id: 'customers', title: '8. კლიენტები, ჯავშნები, ტურნირები', icon: Trophy },
  { id: 'settings', title: '9. პარამეტრები & ფისკალი', icon: Settings },
  { id: 'hardware', title: '10. Hardware კონტროლი', icon: Plug },
  { id: 'billing', title: '11. გამოწერა & პლატფორმა', icon: CreditCard },
  { id: 'ai', title: '12. AI ფუნქციები', icon: Sparkles },
  { id: 'faq', title: '13. ხშირი კითხვები (FAQ)', icon: HelpCircle },
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
        <div className="space-y-3">
          <p>
            სისტემაში შესვლა ხდება ელფოსტისა და პაროლის მეშვეობით. პირველი რეგისტრაციისას გაივლით მოკლე onboarding პროცესს, სადაც იქმნება თქვენი ორგანიზაცია და პირველი ფილიალი.
          </p>
          <p>
            <b>აპად დაყენება:</b> Martelounge არის PWA — ბრაუზერის მენიუდან „მთავარ ეკრანზე დამატება" (Add to Home Screen) დააყენებთ ტელეფონზე ან ტაბლეტზე ცალკე აპივით, საკუთარი ხატულათი.
          </p>
        </div>
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
            ერთეულის ტიპები: PS5, კუპე, VIP, ასევე <b>ბილიარდი/სნუკერი</b>. თითოეულს აქვს ცალკე ტევადობა. თუ ტიპი სრულად დაკავებულია, walk-in სესიები იბლოკება ("console_reserved" სტატუსით).
          </p>
        </div>
      ),
    },
    {
      category: 'sessions',
      title: 'ბილიარდი და მრავალ-ტიპიანი ფილიალი 🎱',
      content: (
        <div className="space-y-3">
          <p>
            Martelounge მხოლოდ PS5-ისთვის არ არის — ემსახურება <b>ბილიარდის სახლსაც</b> (და მომავალში კარაოკეს/VR-ს). ერთ ფილიალში შეიძლება ორივე იყოს ერთად.
          </p>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li><b>ფილიალის ტიპი:</b> პარამეტრები → Marketplace პროფილი → „ფილიალის ტიპი" → აირჩიე 🎱 ბილიარდი ან 🎯 გაერთიანებული (თუ ორივე გაქვს).</li>
            <li><b>მაგიდის დამატება:</b> კონსოლივით დაამატე ერთეული, შემდეგ ტიპის ღილაკით გადაიყვანე <b>ბილიარდი</b>-ზე (PS5 → კუპე → VIP → ბილიარდი → სნუკერი).</li>
            <li><b>ტარიფი:</b> ტარიფზე მიუთითე „ვისთვის" = 🎱 ბილიარდი (და PS5-ის ტარიფებს — 🎮 ფლეირუმი). ასე ბილიარდის სესია/ჯავშანი მხოლოდ ბილიარდის ტარიფს აჩვენებს.</li>
            <li><b>შუქის კონტროლი:</b> მაგიდის ლამპა relay-ით — იხ. „Hardware → ბილიარდის მაგიდის კონტროლი".</li>
          </ol>
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'color-mix(in oklch, var(--primary) 12%, transparent)' }}>
            <div className="flex items-start gap-2">
              <Info className="size-5 shrink-0" style={{ color: 'var(--primary)' }} />
              <p>ყველგან ავტომატურად ერგება: დაფა აჩვენებს 🎱 „მაგიდას", კასა ბილიარდს ცალკე ითვლის, ანალიტიკა RevPATH-ს, QR-პორტალი „ინვენტარს" (ჯოისტიკის ნაცვლად), play.martelounge.ge/live კი ცალკე 🎱 ბილიარდის ტაბს.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      category: 'sessions',
      title: 'დინამიური ფასი — Happy Hour / Surge ⚡',
      content: (
        <div className="space-y-3">
          <p>
            ფასი დროისა და დატვირთვის მიხედვით ავტომატურად იცვლება (სასტუმროების yield management). მართვა: ტარიფები → „დინამიური ფასი".
          </p>
          <ul className="list-disc space-y-1 pl-4">
            <li><b>Happy Hour 🟢</b> — მკვდარ საათებში ფასდაკლება (მაგ. სამშ. 14:00 −25%) → ცარიელი კონსოლები ივსება.</li>
            <li><b>Surge 🔥</b> — პიკზე ფასის აწევა (მაგ. პარ. საღამო +20%).</li>
          </ul>
          <p>
            წესში უთითებ დღეებს, საათებსა და %-ს. სესიის დაწყებისას ოპერატორი ხედავს ეფექტურ ფასს + ⚡ badge-ს; ფასი <b>server-ზე</b> ითვლება (გვერდის ავლა შეუძლებელია).
          </p>
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'color-mix(in oklch, var(--status-free) 12%, transparent)' }}>
            <div className="flex items-start gap-2">
              <Lightbulb className="size-5 shrink-0" style={{ color: 'var(--status-free)' }} />
              <p>Surge ნაგულისხმევად გამორთულია — მთავარი ძალა Happy Hour-ია (მკვდარი საათების შევსება). +15-30% შემოსავალი ერთი ახალი კლიენტის გარეშე.</p>
            </div>
          </div>
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
            <b>ბარკოდის სკანერი:</b> პროდუქტის სწრაფად მოსაძებნად დააჭირეთ კამერის ღილაკს და დაასკანერეთ შეფუთვის ბარკოდი — მუშაობს როგორც POS-ში, ისე ინვენტარში (ტელეფონის/ტაბლეტის კამერით).
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
            თითო კონსოლზე გააკრავთ <b>მუდმივ</b> QR კოდს (იბეჭდება Settings-დან). სტუმარი ასკანერებს → ტელეფონში ეხსნება საჯარო პორტალი ლოგინის გარეშე: ხედავს ბარის მენიუს, სესიის ტაიმერს, აკეთებს შეკვეთას ან იძახებს ოპერატორს (ჯოისტიკის გამოცვლა / სტაფის გამოძახება).
          </p>
          <div
            className="rounded-2xl p-4 text-sm"
            style={{ background: 'color-mix(in oklch, var(--status-free) 12%, transparent)' }}
          >
            <div className="flex items-start gap-2">
              <ShieldAlert className="size-5 shrink-0" style={{ color: 'var(--status-free)' }} />
              <p>
                <b>წვდომის კოდი (PIN + QR):</b> შეკვეთა და მოთხოვნა მუშაობს მხოლოდ <b>აქტიური სესიის</b> დროს. ყოველ სესიას აქვს უნიკალური 6-ნიშნა კოდი — სტუმარი შეიყვანს PIN-ს, რომელსაც ოპერატორი ეუბნება, ან ასკანერებს სესიის QR-ს. სესიის დასრულებისთანავე კოდი უქმდება, ამიტომ ვერც ძველი სტუმარი და ვერც გადაღებული QR ვეღარ შეუკვეთავს. ოპერატორი PIN-სა და სესიის QR-ს ხედავს კონსოლის ბარათზე (მთავარ ეკრანზე).
              </p>
            </div>
          </div>
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
            სუფთა მოგება ითვლება შემდეგნაირად: სესიის შემოსავალი + ბარის სუფთა მოგება (გაყიდვა − პროდუქტის თვითღირებულება/COGS) − დაბრუნებები − გაწეული ხარჯები = მოგება.
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
      category: 'analytics',
      title: 'კონსოლების ინტელექტი — RevPACH 📊',
      content: (
        <div className="space-y-3">
          <p>
            „ანალიტიკა" მოდული აჩვენებს, რამდენად ეფექტურად მუშაობს თითო კონსოლი. მთავარი მაჩვენებელია <b>RevPACH</b> — შემოსავალი თითო <b>ხელმისაწვდომ</b> კონსოლ-საათზე (შემოსავალი ÷ კონსოლები × სამუშაო საათები). პერიოდს ირჩევთ: დღეს / 7 დღე / 30 დღე / ეს თვე.
          </p>
          <ul className="list-disc pl-4 space-y-1">
            <li><b>KPI-ები:</b> RevPACH, დატვირთვა (%), შემოსავალი და კონსოლების რაოდენობა.</li>
            <li><b>კონსოლების მატრიცა:</b> თითო კონსოლი იღებს სტატუსს — ⭐ ვარსკვლავი, საშუალო, სუსტი ან უქმე — საშუალო RevPACH-თან შედარებით.</li>
            <li><b>სითბური რუკა (7×24):</b> კვირის დღე × საათი — სად არის პიკი და სად ცარიელი დრო (თბილისის დროით).</li>
          </ul>
          <div
            className="rounded-2xl p-4 text-sm"
            style={{ background: 'color-mix(in oklch, var(--primary) 12%, transparent)' }}
          >
            <div className="flex items-start gap-2">
              <Lightbulb className="size-5 shrink-0" style={{ color: 'var(--primary)' }} />
              <p>
                <b>AI რჩევები:</b> ღილაკი „AI რეკომენდაციები" აანალიზებს მონაცემს და გაძლევთ კონკრეტულ ნაბიჯებს — რომელ საათებში გაუშვათ აქცია, რომელი კონსოლი გადააფასოთ ან გადააადგილოთ და სად კარგავთ შემოსავალს. მაჩვენებელი ეფუძნება <b>სესიების</b> შემოსავალს (ბარისა და დაბრუნებების გარეშე).
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      category: 'analytics',
      title: 'Martelounge Pulse — საჯარო ცოცხალი გვერდი 📡',
      content: (
        <div className="space-y-3">
          <p>
            <b>play.martelounge.ge/live</b> — საჯარო, real-time გვერდი: „რამდენი ადამიანი თამაშობს ახლა საქართველოში", ქალაქების დატვირთვა და ლაუნჯები (occupancy-ით ანათებენ). შენი გამოქვეყნებული ფილიალი ავტომატურად ჩნდება.
          </p>
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'color-mix(in oklch, var(--primary) 12%, transparent)' }}>
            <div className="flex items-start gap-2">
              <Info className="size-5 shrink-0" style={{ color: 'var(--primary)' }} />
              <p>მხოლოდ აგრეგირებული მონაცემია — კლიენტების პერსონალური ინფო არ ჩანს. უფასო რეკლამა: შენი კლუბის სახელი რუკაზე, მწვანედ ანათებს როცა აქტიურია. გასაჯაროებისთვის — პარამეტრები → მარკეტფლეისი.</p>
            </div>
          </div>
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
            <b>ტურნირები:</b> სრული ტურნირ-პროდუქტი — ონლაინ რეგისტრაცია, QR check-in, „ვირტუალური დოლორა", ჯგუფები + ბადე, ავტომატური ჯილდოს გაცემა და TV-რეჟიმი. ნაბიჯ-ნაბიჯ იხ. ქვემოთ „ტურნირები — სრული ციკლი".
          </p>
        </div>
      ),
    },
    {
      category: 'customers',
      title: 'ტურნირები — სრული ციკლი 🏆',
      content: (
        <div className="space-y-3">
          <p><b>1. შექმნა:</b> ქმნი ტურნირს — საწევრო, საპრიზო ფონდი, ფორმატი (ჯგუფები + ბადე ან single-elim) და მინიმალური მონაწილეები (ამ რიცხვამდე გათამაშება არ დაიწყება).</p>
          <p><b>2. ონლაინ რეგისტრაცია:</b> მოთამაშე რეგისტრირდება play.martelounge.ge-ზე და იღებს QR-პასს თავის /account-ში.</p>
          <p><b>3. Check-in ადგილზე:</b> სკანერავ მოთამაშის QR-ს → ადგილზე იხდის საწევროს (თანხა ავტომატურად ბარის შემოსავალში ჩაითვლება).</p>
          <p><b>4. „ვირტუალური დოლორა":</b> სამართლიანი შემთხვევითი გათამაშება — ანაწილებს ჯგუფებში (ქულები 3/1/0) ან პირდაპირ ბადეში.</p>
          <p><b>5. მატჩები:</b> შედეგებს შენ აფიქსირებ; გამარჯვებული ავტომატურად გადადის. ჯგუფში ფრე-ჩიხი წყდება ასე: პირადი შეხვედრა → პენალები → წილისყრა.</p>
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'color-mix(in oklch, var(--status-free) 12%, transparent)' }}>
            <div className="flex items-start gap-2">
              <Trophy className="size-5 shrink-0" style={{ color: 'var(--status-free)' }} />
              <p>
                <b>6. 🏁 ჯილდოების გაცემა:</b> ერთი ღილაკით — 1-ლი და მე-2 ადგილი იღებენ ფულს (ავტომატურად ჩაიწერება ხარჯებში / P&L-ში), მე-3 ადგილი წყდება <b>ბრინჯაოს მატჩით</b> და იგებს უფასო სათამაშო დროს (კრედიტი). walk-in-ებს ჯილდოს ხელით გადასცემ.
              </p>
            </div>
          </div>
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'color-mix(in oklch, var(--status-active) 12%, transparent)' }}>
            <div className="flex items-start gap-2">
              <Lightbulb className="size-5 shrink-0" style={{ color: 'var(--status-active)' }} />
              <p>
                <b>კრედიტის გამოყენება (კასაზე):</b> მოგებული უფასო დრო მოთამაშეს კოდად (QR „MTLC") უჩანს /account-ში. ადგილზე, სესიის დახურვისას, ოპერატორი სკანერავს ან შეჰყავს ამ კოდს → უფასო წუთები ავტომატურად აკლდება ანგარიშს.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      category: 'settings',
      title: 'Telegram ბოტი & შეტყობინებები 📱',
      content: (
        <div className="space-y-3">
          <p>
            <b>ერთი საერთო ბოტი:</b> @playmarteloungebot — საკუთარს არ ქმნი, უბრალოდ აბამ შენს ორგანიზაციას.
          </p>
          <p>
            <b>დაკავშირება:</b> პარამეტრები → Telegram → „კოდის გენერაცია" → შენი Telegram-იდან ბოტს მისწერე <code className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-xs">/link კოდი</code>. ერთი chat ↔ ერთი ორგანიზაცია (მხოლოდ შენი მონაცემი ჩანს).
          </p>
          <p>
            <b>ბრძანებები:</b> <code className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-xs">/revenue</code> — დღევანდელი შემოსავალი · <code className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-xs">/consoles</code> — კონსოლების სტატუსი · <code className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-xs">/help</code>.
          </p>
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'color-mix(in oklch, var(--status-free) 12%, transparent)' }}>
            <div className="flex items-start gap-2">
              <Lightbulb className="size-5 shrink-0" style={{ color: 'var(--status-free)' }} />
              <p>
                <b>Push შეტყობინებები</b> (ჩართვა/გამორთვა იქვე, პარამეტრები → Telegram): ახალი ონლაინ ჯავშანი · მარაგი იწურება · ღამის შეჯამება · თაღლითობის ეჭვი.
              </p>
            </div>
          </div>
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
      category: 'hardware',
      title: 'რა არის Hardware კონტროლი? 🔌',
      content: (
        <div className="space-y-3">
          <p>
            Hardware კონტროლი ფიზიკურ ჩართვა/გამორთვას უბამს სესიის სტატუსს — სესია დაიწყო → კონსოლი/TV ირთვება, დასრულდა → ითიშება. ეს ხურავს თაღლითობის ხვრელს: თანამშრომელი ვეღარ ამუშავებს კონსოლს სესიის გახსნის გარეშე (უსესიო დრო = დაკარგული შემოსავალი).
          </p>
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'color-mix(in oklch, var(--status-expired) 12%, transparent)' }}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-5 shrink-0" style={{ color: 'var(--status-expired)' }} />
              <p>
                <b>მნიშვნელოვანი (SSD):</b> სჯობს ჩაირთოს/ითიშოს <b>ტელევიზორი ან HDMI სიგნალი</b>, და არა თვითონ კონსოლი — PS5-ის უეცარი გამორთვა SSD-ს აზიანებს. ამიტომ პარამეტრში „რას თიშავს" ნაგულისხმევად <b>TV</b>-ა.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            ფუნქცია არჩევითია — თუ კლუბს მხოლოდ მფლობელი ამუშავებს, შეიძლება საერთოდ არ ჩართო.
          </p>
        </div>
      ),
    },
    {
      category: 'hardware',
      title: 'კონტროლის რეჟიმები — Manual / Cloud / Agent',
      content: (
        <div className="space-y-3">
          <p>პარამეტრები → <b>🔌 Hardware</b>-ში თითო კონსოლს ანიჭებ ერთ რეჟიმს:</p>
          <ul className="list-disc space-y-1.5 pl-4">
            <li><b>Manual</b> — მოწყობილობის გარეშე. სისტემა აღრიცხავს ჩართვა/გამორთვას და გაქვს „Force ON/OFF". მუშაობს ახლავე, ნებისმიერ კლუბში.</li>
            <li><b>Cloud</b> — სმარტ-როზეტი (Shelly) vendor-ის ღრუბლით. ირთვება/ითიშება ავტომატურად, ლეპტოპზე პროგრამის გარეშე.</li>
            <li><b>Agent</b> — ლოკალური relay-ბორდი (USR / Waveshare / „სოჩიკი") ლოკალური bridge-ით. <i>მალე დაემატება.</i></li>
          </ul>
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'color-mix(in oklch, var(--primary) 12%, transparent)' }}>
            <div className="flex items-start gap-2">
              <Info className="size-5 shrink-0" style={{ color: 'var(--primary)' }} />
              <p><b>Force ON/OFF</b> (მფლობელი/ადმინი) — კონსოლის ხელით ჩართვა/გამორთვა ნებისმიერ დროს, საჭიროებისას.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      category: 'hardware',
      title: 'Shelly Cloud-ის დაყენება (Cloud რეჟიმი) ☁️',
      content: (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>შეიძინე <b>Shelly</b> სმარტ-როზეტი და ჩართე ტელევიზორი მასში.</li>
            <li>Shelly-ის აპში: <b>Settings → Authorization Cloud Key</b> — დააკოპირე <b>server</b> და <b>auth key</b>.</li>
            <li>პარამეტრები → 🔌 Hardware → <b>Shelly Cloud account</b>: ჩასვი server + key (ერთხელ, ფილიალზე). გასაღები ინახება დაშიფრულად.</li>
            <li>თითო კონსოლზე აირჩიე რეჟიმი <b>Cloud</b> + driver „Shelly Cloud" + ჩასვი <b>Device ID</b> და <b>Channel</b>.</li>
            <li>დააჭირე <b>Test ON/OFF</b> — დარწმუნდი რომ ირთვება/ითიშება.</li>
          </ol>
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'color-mix(in oklch, var(--status-free) 12%, transparent)' }}>
            <div className="flex items-start gap-2">
              <ShieldAlert className="size-5 shrink-0" style={{ color: 'var(--status-free)' }} />
              <p>გასაღები (auth key) <b>დაშიფრულად</b> ინახება და მხოლოდ სერვერი იყენებს — ეკრანზე აღარასდროს ჩანს.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      category: 'hardware',
      title: 'მკაცრი რეჟიმი — სესია მხოლოდ კონფიგურირებულ კონსოლზე',
      content: (
        <div className="space-y-3">
          <p>
            პარამეტრები → 🔌 Hardware-ში არის გადამრთველი <b>„სესია მხოლოდ კონფიგურირებულ კონსოლზე"</b>:
          </p>
          <ul className="list-disc space-y-1.5 pl-4">
            <li><b>გამორთული (ნაგულისხმევი):</b> ყველაფერი ჩვეულებრივ — ოპერატორი თავისუფლად იწყებს სესიას.</li>
            <li><b>ჩართული:</b> ოპერატორი სესიას <b>ვერ დაიწყებს</b> კონსოლზე, რომელსაც კონტროლი დაყენებული არ აქვს — ვერ აუვლის გვერდს anti-fraud-ს.</li>
          </ul>
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'color-mix(in oklch, var(--status-warning5) 12%, transparent)' }}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-5 shrink-0" style={{ color: 'var(--status-warning5)' }} />
              <p>ჩართვამდე დარწმუნდი, რომ ყველა აქტიურ კონსოლს hardware აქვს დაყენებული — თორემ მათზე სესიის დაწყება დაიბლოკება.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      category: 'hardware',
      title: 'ცვეთა და მოვლა (Predictive Maintenance) 🔧',
      content: (
        <div className="space-y-3">
          <p>
            სისტემა ითვლის თითო კონსოლის ცვეთას (სესიები + ნათამაშები საათები) და გაფრთხილებს, სანამ ჯოისტიკი გაფუჭდება (DualSense drift ~400-600სთ).
          </p>
          <ul className="list-disc space-y-1 pl-4">
            <li><b>ჯანმრთელობის ქულა</b> — 95% → 75% → 50% → 20% ცვეთის ზრდასთან ერთად.</li>
            <li>მთავარ ეკრანზე კონსოლის ბარათზე — 🔧 „მოვლა რეკომენდებულია" badge, როცა ჯანმრთელობა ≤50%.</li>
            <li>პარამეტრები → 🔌 Hardware — თითო კონსოლზე ჯანმრთელობა % + სესიები + ღილაკი <b>„ჯოისტიკი შევცვალე"</b> (ცვეთის მრიცხველს ნულავს).</li>
          </ul>
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'color-mix(in oklch, var(--status-warning5) 12%, transparent)' }}>
            <div className="flex items-start gap-2">
              <Info className="size-5 shrink-0" style={{ color: 'var(--status-warning5)' }} />
              <p>პროაქტიული მოვლა — დამტვრეული ჯოისტიკი აღარ ხვდება კლიენტს ხელში. ხარჯს გეგმავ, ავარიას არ ელოდები.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      category: 'hardware',
      title: 'ბილიარდის მაგიდის კონტროლი — შუქი 🎱',
      content: (
        <div className="space-y-3">
          <p>
            Martelounge მხოლოდ PS5-ისთვის არ არის — <b>ბილიარდის სახლსაც</b> ემსახურება. მაგიდა იქმნება ჩვეულებრივ კონსოლივით (ტიპი „ბილიარდი" / „სნუკერი"), კონტროლის ბერკეტი კი მაგიდის <b>ჭერის ლამპაა</b>.
          </p>
          <ul className="list-disc space-y-1.5 pl-4">
            <li><b>სტარტზე</b> — სესიის დაწყებისას შუქი <b>ავტომატურად ინთება</b> (smart relay-ით, ისევე როგორც PS5-ის TV).</li>
            <li><b>ბოლოს</b> — სესიის დასრულებისას შუქი ქრება <b>grace</b>-ის შემდეგ (60–90წმ — კლიენტი ასწრებს გადახდას/მაგიდის აწყობას), მერე მაგიდა ბნელდება.</li>
            <li><b>ანტი-თაღლითობა</b> — შუქი მხოლოდ ფასიანი სესიის დროს ანთია; ოპერატორი ვერ აანთებს მას სესიის გახსნის გარეშე (relay სისტემას ეკუთვნის, არა კედლის ჩამრთველს).</li>
          </ul>
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'color-mix(in oklch, var(--status-free) 12%, transparent)' }}>
            <div className="flex items-start gap-2">
              <Info className="size-5 shrink-0" style={{ color: 'var(--status-free)' }} />
              <p>დაყენება: პარამეტრები → 🔌 Hardware → მაგიდა → „რას თიშავს" = <b>შუქი</b>, შემდეგ მიუთითე <b>Grace</b> (წამები). ლამპა უსაფრთხოა — SSD-ის რისკი არ აქვს, პირდაპირ ვთიშავთ.</p>
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
          გამოწერები: Trial (უფასო), PRO (₾50/თვე), ENTERPRISE (₾70/თვე). ანგარიშსწორება ამჟამად ხელით ხდება (WhatsApp/გადარიცხვა).
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
      title: 'ღამის ანგარიში — AI Closing Brief 🌙',
      content: (
        <div className="space-y-3">
          <p>
            მთავარ ეკრანზე ღილაკი <b>„🌙 ღამის ანგარიში"</b> — ერთი დაჭერით AI კითხულობს მთელ დღეს და გიწერს მოკლე ბრიფს ქართულად: დღის შეფასება (ქულა), რა იყო კარგი, რას მიაქციო ყურადღება და <b>3 კონკრეტული ნაბიჯი ხვალისთვის</b>.
          </p>
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'color-mix(in oklch, var(--primary) 12%, transparent)' }}>
            <div className="flex items-start gap-2">
              <Sparkles className="size-5 shrink-0" style={{ color: 'var(--primary)' }} />
              <p>აერთიანებს ყველაფერს: შემოსავალი (vs გუშინ), ტოპ/უქმე კონსოლი, პიკის საათი, საეჭვო ქმედებები, დაბალი მარაგი და კონსოლების ჯანმრთელობა — ერთ ჭკვიან ტექსტში. დილის ყავასთან წასაკითხად. ☕</p>
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
      title: '"სტუმარი ამბობს — In-Seat კოდი არ მუშაობს"',
      content: (
        <p>
          დარწმუნდით, რომ კონსოლზე <b>აქტიური სესიაა</b> და სტუმარს მისცეს <b>მიმდინარე</b> სესიის კოდი — ის ჩანს კონსოლის ბარათზე მთავარ ეკრანზე. ყოველ ახალ სესიას ახალი კოდი აქვს, ამიტომ წინა სესიის (ან გადაღებული QR-ის) კოდი აღარ მუშაობს. ალტერნატივად — ანახეთ სესიის QR დასასკანერებლად.
        </p>
      ),
    },
    {
      category: 'faq',
      title: '"კონსოლი/TV ავტომატურად არ ჩაირთო"',
      content: (
        <p>
          შეამოწმე: (1) კონსოლზე Hardware დაყენებულია? (პარამეტრები → 🔌). (2) Cloud რეჟიმზე — Shelly server/key და Device ID სწორია? დააჭირე <b>Test</b>-ს. (3) <b>Manual</b> რეჟიმი მხოლოდ აღრიცხავს — ფიზიკურად არ რთავს; ავტომატური ჩართვისთვის საჭიროა რეალური მოწყობილობა (Cloud/Agent). საჭიროებისას ხელით — <b>Force ON</b>.
        </p>
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
