# Stok Akurat — Build Plan

## ⚠️ Stack Mismatch — Please Confirm Before I Build

Your brief specifies **Next.js 16 App Router**, but this Lovable project is a **TanStack Start + React 19 + Vite** template (see `src/routes/__root.tsx`, `src/router.tsx`). It's **not** the TailAdmin Next.js dashboard — none of the components you listed (`AppSidebar`, `EcommerceMetrics`, `BasicTableOne`, `LineChartOne`, `ComponentCard`, etc.) exist in this repo. Only shadcn primitives are available.

I can't switch this project to Next.js. I have two realistic paths:

### Option A — Rebuild on this stack (recommended)
Implement the full SRS on **TanStack Start + Supabase (Lovable Cloud) + Tailwind v4 + shadcn/ui**.
- All backend logic (schema, RLS, RPCs, FEFO, ledger immutability, opname, retur) is **identical** — it lives in Postgres, not the framework.
- UI is built with shadcn equivalents: `Table` (≈ BasicTableOne), `Card` (≈ ComponentCard), `Select/Input/Textarea`, `Dialog` (≈ Modal), `Badge`, `Alert`, Recharts for LineChart/BarChart, custom sidebar.
- Coral/amber palette, sidebar structure, and every route from your mapping table are preserved.
- Deploy: Lovable publish (frontend) + Lovable Cloud (Supabase-managed).

### Option B — Start over in a Next.js project with the TailAdmin template
You'd need to create a new project seeded with TailAdmin. I can't do that from here.

**If you confirm Option A, I proceed with the plan below. The grading criteria (ledger correctness, FEFO, traceability) are fully met — they're database-level guarantees.**

---

## Execution Plan (Option A)

### Stage 1 — Foundation
1. Enable Lovable Cloud (Supabase).
2. Migrations (in dependency order):
   - Master: `channels`, `movement_types`, `movement_reasons`, `products`, `batches`, `bundles`, `bundle_items`.
   - `orders`, `order_items`, `returns`, `opname_sessions`, `opname_entries`.
   - `stock_ledger` (append-only: revoke UPDATE/DELETE + trigger `forbid_ledger_mutation`).
   - `user_roles` + `has_role()` security-definer.
   - RLS on all tables. Direct INSERT on `stock_ledger` revoked from `authenticated`; writes only via RPC.
3. RPC functions (all `security definer`, atomic):
   - `allocate_batch_fefo` — orders by `expiry_date ASC`, multi-batch split, raises if insufficient.
   - `record_stock_movement` — locks batch row, validates, inserts ledger, updates `batches.current_stock`. **Only path** that mutates stock.
   - `process_shipment` — expands bundles via `bundle_items`, FEFO-allocates each component, writes ledger, sets `orders.status='SHIPPED'`.
   - `process_cancellation` — RESERVED → status update only, no ledger. SHIPPED → returns each item to its original batch with `reason='cancellation'`.
   - `process_return` — RESALABLE adds stock back; DAMAGED/LOST do NOT touch ledger; TikTok+LOST sets `claim_deadline = return_date + 40 days`.
   - `daily_consistency_check` — recomputes expected stock from ledger, returns diffs + orphan SHIPPED/ledger anomalies.
   - `apply_opname_correction` — writes ledger entry from `discrepancy`.
4. Seed: ~70 skincare products, 1–3 batches each with varied expiries, channels (Shopee/TikTok Shop/Offline), movement_types, all system reasons.
5. Reskin: coral/amber palette in `src/styles.css` (oklch tokens), custom sidebar layout under `_authenticated`.
6. SQL tests proving: FEFO order, `stock_after` invariant, RESERVED-cancel no-op, DAMAGED/LOST no stock-in, ledger immutability.

### Stage 2 — Core (P0)
7. `/movements/new` — Form Input Cepat (react-hook-form + zod, reason list filtered by direction, auto-FEFO batch preview, confirm modal, calls `record_stock_movement`).
8. `/movements` — Ledger history: filters (period/product/channel/reason/direction), pagination, CSV export, detail dialog.
9. `/` — Dashboard: 4 metric cards, product status table with Kritis/Peringatan/Aman badges, 7/30-day discrepancy line chart, anomaly alert.
10. `/simulation` — Marketplace adapter (`MarketplaceService` interface + `SimulationMarketplaceService`) with Shopee/TikTok create/ship/cancel/return buttons; UI never touches stock directly.
11. `/returns/[id]/inspect` — Radio (Resalable/Damaged/Lost), TikTok claim countdown (red < 7 days).

### Stage 3 — Advanced (P1)
12. `/products` — CRUD products + batches tab, CSV import, expiry badges.
13. `/products/bundles` — bundle recipe CRUD (repeatable product+qty rows).
14. `/products/reference-data` — channels & reasons (system reasons locked).
15. `/reconciliation/daily` — run + display anomalies from `daily_consistency_check`.
16. `/reconciliation/opname` — start session → per-batch physical input → discrepancy view → apply corrections → close.
17. `/reconciliation/report` — filters, distribution charts, drill-down from any discrepancy to its ledger transactions.

### Stage 4 — Access & Security
18. `/auth` sign in/up wired to Supabase Auth (email/password + Google).
19. `/users` admin CRUD + role assignment.
20. Route gates via `_authenticated` layout + role checks (`has_role`) for admin/manager-only pages.
21. Finalize RLS: admin-only writes on master data; read policies for authenticated.

### Stage 5 — Hardening & Deploy
22. Scheduled `daily_consistency_check` (pg_cron) + expiry-threshold badges (< 90 days).
23. Manual E2E against every acceptance criterion in §11.
24. Publish.

---

## Non-negotiables enforced
- `stock_ledger` append-only (revoke + trigger).
- `batches.current_stock` mutated **only** via `record_stock_movement`.
- FEFO in SQL, not client.
- RESERVED cancel = no ledger write.
- DAMAGED/LOST returns = no stock-in.
- Bundle orders explode to component-level ledger rows.
- Every stock change carries reason + channel + reference (order/return/opname).

---

**Please reply with "Go Option A" (or feedback) and I'll start Stage 1.**
