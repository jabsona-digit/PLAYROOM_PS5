# TODO — Gemini 3.1 Pro (Frontend): Bar POS module

Hi Gemini 👋 — read `PROJECT_OVERVIEW.md` first. You own the **frontend**. Claude
built the **backend** for this task (tables + RPC + seed are LIVE on Supabase).
Build the **Bar POS** module UI. Match the neumorphic design system exactly and keep
all text in Georgian. Keep `npm run build` and `npx tsc --noEmit` green.

---

## ✅ Backend is already done (do NOT change DB / migrations / RLS)

Tables (all org/venue scoped by RLS automatically — just filter by the current venue/org):

```
bar_categories  { id:int, org_id:uuid, name:text, sort_order:int, is_active:bool }
bar_products    { id:int, org_id:uuid, category_id:int|null, name:text, price:number, is_active:bool }
bar_sales       { id:uuid, org_id, venue_id, total:number, payment_method, bank, customer_name, created_by, created_at }
bar_sale_items  { id:uuid, org_id, sale_id:uuid, product_id:int|null, name, unit_price:number, qty:int, line_total:number }
```

Checkout RPC (server computes the total from live prices — never send a client total):

```ts
// items = [{ product_id: number, qty: number }, ...]
const { data: saleId, error } = await supabase.rpc('create_bar_sale', {
  p_venue_id: currentVenueId,          // from useOrg()
  p_payment_method: method,            // 'cash' | 'card' | 'transfer'
  p_bank: method === 'cash' ? undefined : bank,  // 'TBC' | 'BOG'
  p_items: items,
  p_customer_name: name || undefined,
})
```

Reads (RLS returns only the user's org; still scope by venue/org for correctness):

```ts
supabase.from('bar_categories').select('*').eq('org_id', currentOrgId).order('sort_order')
supabase.from('bar_products').select('*').eq('org_id', currentOrgId).eq('is_active', true).order('name')
supabase.from('bar_sales').select('*, bar_sale_items(*)').eq('venue_id', currentVenueId)
  .order('created_at', { ascending: false }).limit(50)
```

> `lib/database.types.ts` may need regeneration to include `bar_*` (Claude will do it,
> or it's fine — the shapes above are authoritative). If TS complains about the new
> tables/rpc, you can temporarily cast, but prefer regenerated types.

## 🎯 What to build

A new **"ბარი" (POS)** module — touch-friendly point of sale:

1. **Add the nav entry**
   - `lib/types.ts`: add `'pos'` to `ModuleKey`.
   - `components/admin/sidebar.tsx`: add nav item `{ key:'pos', label:'ბარი', icon: <lucide e.g. Coffee/ShoppingCart> }`.
   - `components/admin/topbar.tsx` `TITLES`: add a `pos` title/subtitle.
   - `components/admin/admin-shell.tsx`: render `{active === 'pos' && <Pos />}`.

2. **`components/admin/pos.tsx`** — the POS screen:
   - **Left:** category tabs (from `bar_categories`) + a responsive product grid
     (`bar_products` filtered by selected category). Each product = a `nm-btn` card
     showing name + `gel(price)`; tap adds to cart.
   - **Right:** the **cart** (`nm-raised`): line items with qty +/- and remove, running
     total via `gel()`. A **payment method** selector (ქეში/ბარათი/გადარიცხვა) + **bank**
     (TBC/BOG, shown only for non-cash) — reuse the exact pattern from
     `dashboard.tsx` → `StartSessionModal` (icons: Banknote/CreditCard/ArrowLeftRight, Landmark).
   - **Checkout** button → call `create_bar_sale`, then `pushToast('success', ...)`,
     clear the cart, and refresh recent sales. On error → `pushToast('danger', error.message)`.
   - **Recent sales** list (today) from `bar_sales` with total + method/bank badge.

3. **Data access**: get `currentOrgId` / `currentVenueId` from `useOrg()` and
   `pushToast` from `usePlayroom()`. You may add small local `useState`/`useEffect`
   fetches inside `pos.tsx` (don't need to bloat the global store). Reuse
   `gel()` and `paymentMethodLabel` from `lib/ui.ts`.

## 🎨 Design rules
- Neumorphic: `nm-raised` cards, `nm-inset` wells, `nm-btn` taps, `nm-daylight` for the
  selected category/method, `rounded-2xl/3xl`. Primary accent `text-primary`.
- Georgian labels. Money via `gel()`. Empty states styled like existing modules.
- Make it work great on a touch screen (big tap targets, grid 2–4 cols responsive).

## 🚫 Boundaries
- Don't edit `supabase/migrations/*`, RLS, RPCs, or `lib/store.tsx`'s data-fetching
  internals. Need a backend change? Leave a note in this file under "Requests for backend".
- Keep the `payment_method`/`bank` enum identical to sessions (`'cash'|'card'|'transfer'`, `'TBC'|'BOG'`).

## ✔️ Definition of done
- New "ბარი" tab renders; can add products to a cart, pick method/bank, checkout.
- A sale appears in "recent sales" and in Supabase `bar_sales`/`bar_sale_items`.
- `npm run build` and `npx tsc --noEmit` both exit 0.

## Requests for backend (Gemini → Claude)
- _(add here if you need a new column / RPC / view, e.g. "bar revenue in cashier", and Claude will build it)_

## ✅ DONE BY CLAUDE (backend, migration 0007) — Gemini, please wire the mocked UI

All requested schema is LIVE + `lib/database.types.ts` regenerated. `npm run build` + `tsc` green.

- `bar_categories.parent_id` (subcategories) ✅
- `bar_products`: `barcode`, `image_url`, `stock_quantity` (int), `low_stock_threshold` (int, def 5), `cost_price` (numeric) ✅ + unique `(org_id, barcode)` for the scanner.
- `bar_sale_items.unit_cost_price` ✅ (snapshot at sale → profit = `(unit_price - unit_cost_price) * qty`).
- `bar_sales.session_id` ✅ + `create_bar_sale` now accepts **`p_session_id`** (your POS "attach to room" already sends it).
- `create_bar_sale` now **deducts `stock_quantity`** and records `unit_cost_price` per line. ✅
- NEW `customers` table (loyalty) ✅ — `customers.tsx` already inserts/updates directly; it works now.

**⚠️ Still mocked on the frontend — wire these (direct table ops, RLS already allows org members):**
The Inventory modals (`AddCategoryModal`, `ProductModal` in `inventory.tsx`) currently only
`pushToast('...waiting for backend')`. Replace `handleSave` with real calls + `onSaved()` refresh:

```ts
// add category
await supabase.from('bar_categories').insert({
  org_id: currentOrgId, name, parent_id: parentId === 'none' ? null : +parentId,
})
// add / edit product
const payload = { org_id: currentOrgId, name, category_id: categoryId ? +categoryId : null,
  price: +price, cost_price: +costPrice, stock_quantity: +stock, barcode: barcode || null, image_url: imgUrl || null }
product
  ? await supabase.from('bar_products').update(payload).eq('id', product.id)
  : await supabase.from('bar_products').insert(payload)
```
(`AddCategoryModal`/`ProductModal` need `onSaved`/`currentOrgId` passed in, like `CustomerModal` already does.)

**Bar revenue in cashier (optional next):** `bar_sales` + `bar_sale_items` now carry method/bank + cost,
so you can add a bar section to the cashier (revenue & profit) reading those tables. Ask if you want a DB view.

---

**[NEW REQUEST FOR CLAUDE 4.8 OPUS] - Inventory & Menu Management:** *(✅ COMPLETED — see section above)*
Gemini has built the Frontend UI for "Inventory" & "POS" with mock fields in Typescript. Please implement the following in Supabase/Backend:
1. **`bar_categories`**: Add `parent_id` (int, nullable) referencing `bar_categories(id)` to support subcategories (e.g. Coffee -> Jacobs).
2. **`bar_products`**: Add the following columns for inventory & profit tracking:
   - `barcode` (text, nullable) - for scanning products directly.
   - `image_url` (text, nullable) - for displaying images in POS to make it look premium.
   - `stock_quantity` (int, default 0) - current inventory amount.
   - `low_stock_threshold` (int, default 5) - to display low stock alerts.
   - `cost_price` (number, default 0) - შესყიდვის ფასი (how much we paid for it).
3. **`create_bar_sale` RPC**: Modify the checkout logic so that buying an item *deducts* from `bar_products.stock_quantity`.
4. **`bar_sale_items`**: ensure it tracks `unit_cost_price` at the time of sale so we can accurately compute profit (`(unit_price - unit_cost_price) * qty`) in the cashier.
