# Stock Reconciliation Remediation Implementation Plan

> **Execution rule:** Implement this plan task-by-task with the red-green-refactor loop shown below. Stop on the first failed validation and report it before changing unrelated code. Do not rewrite applied migrations, commit, push, mutate production, or deploy production without explicit user instructions.

## Goal

Bring Stok Akurat into conformance with the Phase 2 Sync Update and the approved remediation design: a transaction-safe immutable stock engine, complete tests, a Next.js 16 App Router application, a verified Vercel preview, and a separately approved production migration/deployment.

## Architecture

- PostgreSQL is the stock engine and the only layer that allocates FEFO, snapshots bundle recipes, applies event state transitions, handles returns, maintains the balance cache, and inserts ledger rows.
- `stock_ledger` is append-only. Definitive balance is signed ledger aggregation; `stock_balance_summary` is its transactionally maintained O(1) read cache.
- Browser code never writes stock or workflow tables. Zod-validated Next.js Server Actions call five authenticated public RPCs.
- Simulation and file import are adapters that emit the same `StockEvent` envelope intended for future webhooks.
- Next.js Server Components perform authenticated reads; Client Components are limited to interactive forms and tables.
- Production is a hard approval gate after clean local and preview/staging evidence.

## Required Stack

- Next.js 16.2.12, React 19, TypeScript
- Supabase/PostgreSQL 17, Supabase SSR, pgTAP
- Zod, existing Radix primitives, Tailwind CSS 4
- Vitest and Playwright
- Vercel Preview and Production environments

## Requirement Trace

| Requirement area | Plan tasks |
| --- | --- |
| BR-18/BR-19, FR-201–FR-208, FR-704: immutable ledger, RLS, RPC-only writes, summary parity | 01, 02, 05, 06, 08, 12, 23 |
| BR-01/BR-03/BR-08, FR-401–FR-410, FR-601: cutoffs, event seam, FEFO, idempotency | 03, 07, 10, 13, 18, 22 |
| BR-04, FR-105/FR-407: recipe versioning | 03, 05, 07, 16, 22 |
| BR-06/BR-07/BR-16, FR-501–FR-506/FR-606: partial returns and claims | 04, 07, 14, 19, 22 |
| BR-13/BR-14/BR-15/BR-17, FR-301–FR-306: manual writes, correction, preview, opening balance | 02, 04, 06, 12, 17, 22 |
| BR-05/BR-11, FR-602–FR-605: daily reconciliation, stocktake, drill-down | 04, 06, 11, 14, 20, 22 |
| FR-101–FR-106: products, batches, expiry, fixed dictionaries | 05, 11, 16, 21 |
| FR-701–FR-704: one-role authentication and actor audit | 02, 05, 09, 23 |
| Fully working live Next.js/Vercel release | 09, 15–25 |

## Frozen Public Contracts

### Database RPCs

All functions accept one `jsonb` argument, return `jsonb`, reject missing `auth.uid()`, set a hardened search path, revoke `EXECUTE` from `PUBLIC` and `anon`, and grant it only to `authenticated`.

```sql
public.record_goods_in(payload jsonb) returns jsonb
public.record_manual_out(payload jsonb) returns jsonb
public.process_stock_event(payload jsonb) returns jsonb
public.correct_ledger_entry(payload jsonb) returns jsonb
public.certify_stocktake(payload jsonb) returns jsonb
```

### TypeScript command contracts

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors: Record<string, string[]>; formError?: string }

type RecordGoodsInInput = {
  requestId: string
  productId: string
  batchCode: string
  receivedAt: string
  productionDate?: string
  expiryDate: string
  quantity: number
  reference: string
}

type RecordManualOutInput = {
  requestId: string
  productId: string
  quantity: number
  reason: "offline" | "bonus" | "promo" | "sample" | "damaged" | "expired"
  channel: "offline" | "internal"
  referenceNote?: string
}

type CorrectLedgerEntryInput = {
  requestId: string
  ledgerEntryId: string
  quantity: number
  referenceNote: string
}

type CertifyStocktakeInput = {
  requestId: string
  sessionId: string
  openedAt: string
  lines: Array<{
    productId: string
    batchId: string
    recordedQuantitySnapshot: number
    countedQuantity: number
  }>
}

type StockEvent = {
  idempotencyKey: string
  channel: "shopee" | "tiktok"
  type:
    | "order.created"
    | "order.status_changed"
    | "order.cancelled"
    | "return.submitted"
  occurredAt: string
  externalReference: string
  payload: unknown
}

type ReturnInspectionCommand = {
  idempotencyKey: string
  type: "return.inspected"
  occurredAt: string
  externalReference: string
  payload: {
    lines: Array<{
      fulfilledComponentId: string
      quantity: number
      condition: "resellable" | "damaged" | "lost_in_transit"
      batchCode?: string
      receivedAt?: string
      expiryDate?: string
      notes?: string
    }>
  }
}
```

`StockEvent` is the external adapter/webhook seam. `ReturnInspectionCommand` is an authenticated internal warehouse command accepted by `process_stock_event`; adapters must never emit it.

### Result contracts

```ts
type StockWriteResult = {
  requestId: string
  ledgerEntryIds: string[]
  allocationIds: string[]
  balanceBefore: number
  balanceAfter: number
}

type StockEventResult = {
  eventId: string
  duplicate: boolean
  status: string
  ledgerEntryIds: string[]
  allocationIds: string[]
  claimRecordIds: string[]
}

type StocktakeResult = {
  sessionId: string
  ledgerEntryIds: string[]
  verifiedOpeningBalanceIds: string[]
  status: "certified"
}
```

## Parallel Batches and Critical Path

1. **Batch 01:** 01 contract harness.
2. **Batch 02 in parallel:** 02 ledger/security tests, 03 event/FEFO tests, 04 return/correction/stocktake tests.
3. **Batch 03:** 05 schema hardening.
4. **Batch 04 in parallel:** 06 manual-write RPCs and 07 event engine RPC.
5. **Batch 05:** 08 clean database gate and generated types. **No application migration may start before this passes.**
6. **Batch 06:** 09 Next.js/Auth foundation.
7. **Batch 07 in parallel:** 10 event adapters and 11 read models.
8. **Batch 08 in parallel:** 12 manual actions, 13 event actions, 14 return/reconciliation actions.
9. **Batch 09:** 15 authenticated shell/dashboard.
10. **Batch 10 in parallel:** 16 products/bundles, 17 movements, 18 simulation/import, 19 returns/claims, 20 reconciliation.
11. **Batches 11–14 sequential:** 21 cleanup → 22 E2E → 23 local gate → 24 preview/staging.
12. **Batch 15 blocked:** 25 production migration/deploy requires explicit user approval.

Critical path: `01 → (02,03,04) → 05 → (06,07) → 08 → 09 → 11 → 15 → (16,17,18,19,20) → 21 → 22 → 23 → 24 → approval → 25`.

---

## Task 01: Establish Database Test Harness and Public RPC Contract

**Requirements:** BR-18; FR-204, FR-207, FR-208, FR-704.

**Files**

- Create `supabase/tests/database/00_test_helpers.sql`.
- Create `supabase/tests/database/00_rpc_contracts.test.sql`.

**TDD steps**

1. Add rollback-isolated helper routines for a test auth user, JWT claim impersonation, products, batches, recipe versions, orders, and fixed UUIDs.
2. Assert the five exact `jsonb → jsonb` RPC signatures, authenticated grants, and absence of anon/public execution.
3. Run `npx supabase test db supabase/tests/database/00_rpc_contracts.test.sql`.
4. Expected result: **FAIL** because the five approved signatures do not yet exist.
5. Do not add production functions in this task.

**Acceptance criteria**

- Fixtures are deterministic and rollback after each file.
- Failure output identifies missing signatures/grants, not fixture errors.
- No existing migration or application file changes.

## Task 02: Write Failing Ledger Integrity, Summary, and Security Tests

**Requirements:** BR-02, BR-12, BR-15, BR-18, BR-19; FR-201–FR-208, FR-302b, FR-703–FR-704.

**Files**

- Create `supabase/tests/database/01_ledger_integrity.test.sql`.

**TDD steps**

1. Test anon and authenticated direct `INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE` attempts against `stock_ledger`.
2. Test RPC actor attribution, fixed reason/channel validation, required references, non-negative balances, atomic summary updates, and ledger/SUM parity.
3. Test `SECURITY DEFINER` search paths and exact function grants.
4. Run `npx supabase test db supabase/tests/database/01_ledger_integrity.test.sql`.
5. Expected result: **FAIL** on current grants, full-scan summary maintenance, or missing public RPC behavior.

**Acceptance criteria**

- Every trust boundary has a negative assertion.
- Summary parity is checked after multiple signed deltas, not only one insert.
- Existing behavior is not relaxed to make tests pass.

## Task 03: Write Failing Event, FEFO, Cancellation, and Bundle Tests

**Requirements:** BR-01, BR-03, BR-04, BR-08, BR-09; FR-401–FR-410, FR-601.

**Files**

- Create `supabase/tests/database/02_stock_event_engine.test.sql`.

**TDD steps**

1. Test Shopee and TikTok lifecycle cutoffs with reservation-only pre-cutoff states.
2. Test deterministic FEFO order `expiry_date, created_at, batch_id`, split allocation, expired/inactive exclusion, and insufficient stock rollback.
3. Use two database sessions to prove concurrent allocation cannot oversell or double-allocate.
4. Test partial cancellation before/after cutoff against exact allocation rows.
5. Test identical duplicate, conflicting duplicate, and out-of-order event behavior.
6. Test old/new bundle recipe snapshots and missing-recipe manual review.
7. Run `npx supabase test db supabase/tests/database/02_stock_event_engine.test.sql`.
8. Expected result: **FAIL** because current RPCs use mutable bundle items, do not claim events atomically, and do not lock strict FEFO candidates.

**Acceptance criteria**

- Both marketplace state machines and full/partial cases are covered.
- Concurrency is an actual two-session test, not sequential simulation.
- No `SKIP LOCKED` is accepted for strict FEFO.

## Task 04: Write Failing Return, Correction, and Stocktake Tests

**Requirements:** BR-05–BR-07, BR-13, BR-16–BR-17; FR-301b, FR-306, FR-501–FR-506, FR-603–FR-606.

**Files**

- Create `supabase/tests/database/03_returns_corrections_stocktake.test.sql`.

**TDD steps**

1. Test partial component returns and cumulative quantity limits.
2. Test sellable return creates a zero-start `origin = retur` batch followed by one ledger entry.
3. Test damaged/lost create distinct claims and no second ledger movement; test TikTok deadline from submission timestamp.
4. Test bounded linked correction and duplicate full reversal rejection.
5. Test stocktake snapshot/certification atomicity and computed opening verification without ledger updates.
6. Run `npx supabase test db supabase/tests/database/03_returns_corrections_stocktake.test.sql`.
7. Expected result: **FAIL** on partial quantities, current return-batch initialization, correction bounds, or stocktake atomicity.

**Acceptance criteria**

- Tests explicitly count ledger rows before and after damaged/lost decisions.
- Failure rollback leaves session and balances unchanged.
- `manual_correction` and `opname_correction` remain distinct.

## Task 05: Add Forward-Only Stock Schema and Security Hardening Migration

**Requirements:** FR-102–FR-106, FR-201–FR-208, FR-407, FR-501–FR-506, FR-603–FR-606, FR-702–FR-704.

**Files**

- Create `supabase/migrations/202608040001_stock_remediation_schema.sql`.
- Modify `supabase/seed.sql`.

**Implementation steps**

1. Add allocation, event result/fingerprint, component return, correction linkage, stocktake snapshot, opening verification, and read-view structures forward-only.
2. Replace summary full-scan maintenance with a locked atomic signed delta.
3. Revoke unsafe workflow writes and ledger mutation privileges; add a TRUNCATE guard and authenticated-read RLS.
4. Disable out-of-scope tables/channels/routes at the database policy/data level without editing applied migrations.
5. Make the seed deterministic and ledger-contract compliant.
6. Run `npx supabase db reset`.
7. Expected result: **PASS** for migration/seed application.
8. Run `npx supabase test db supabase/tests/database/01_ledger_integrity.test.sql`.
9. Expected result: schema/security assertions pass; RPC-specific assertions may remain red until Tasks 06–07.

**Acceptance criteria**

- Existing migration files remain byte-for-byte unchanged.
- New structures preserve old application compatibility until migration completion.
- No stock balance is initialized by updating a cache/batch outside a ledger-backed transaction.

## Task 06: Implement Goods-In, Manual-Out, Correction, and Stocktake RPCs

**Requirements:** BR-03, BR-13–BR-15, BR-17–BR-19; FR-301–FR-306, FR-601, FR-603–FR-604.

**Files**

- Create `supabase/migrations/202608040002_stock_write_rpcs.sql`.

**TDD steps**

1. Run Tasks 02 and 04 tests; expected result: **FAIL** on missing RPCs.
2. Implement `record_goods_in`, `record_manual_out`, `correct_ledger_entry`, and `certify_stocktake` using the frozen contracts.
3. Keep FEFO allocation and every side effect in each function transaction; derive actor from `auth.uid()`.
4. Revoke default execution in the same migration transaction and grant only `authenticated`.
5. Run `npx supabase db reset && npx supabase test db supabase/tests/database/01_ledger_integrity.test.sql supabase/tests/database/03_returns_corrections_stocktake.test.sql`.
6. Expected result: **PASS** for manual-write, correction, and stocktake assertions.

**Acceptance criteria**

- Reference validation exists in the database, not only Zod.
- Corrections never mutate originals and cannot exceed remaining correctable quantity.
- Stocktake certification is one all-or-nothing call.

## Task 07: Implement Transaction-Safe Stock Event Engine RPC

**Requirements:** BR-01, BR-03–BR-09, BR-16, BR-18; FR-401–FR-410, FR-501–FR-506, FR-601.

**Files**

- Create `supabase/migrations/202608040003_stock_event_engine.sql`.

**TDD steps**

1. Run Tasks 03 and 04 event/return cases; expected result: **FAIL** on missing engine behavior.
2. Implement atomic event claim with unique key plus canonical payload fingerprint and stored result.
3. Implement channel state transitions, strict locked FEFO, immutable allocations, recipe snapshots, partial cancellation, return submission, and internal return inspection.
4. Return the stored result for identical duplicates; reject key/content conflicts; roll back the claim on any transition failure.
5. Run `npx supabase db reset && npx supabase test db supabase/tests/database/02_stock_event_engine.test.sql supabase/tests/database/03_returns_corrections_stocktake.test.sql`.
6. Expected result: **PASS**, including two-session concurrency.

**Acceptance criteria**

- Simulation-specific logic does not exist in SQL.
- Damaged/lost decisions add zero ledger rows.
- Old orders never read current recipe lines.

## Task 08: Close Database Gate and Regenerate Supabase Types

**Requirements:** All database-backed BR-01–BR-19 and FR-101–FR-704.

**Files**

- Modify generated `src/integrations/supabase/types.ts` only through CLI output.

**Verification steps**

1. Run `npx supabase db reset` → expected **PASS**.
2. Run `npx supabase test db` → expected **PASS**, zero failed assertions.
3. Run `npx supabase gen types typescript --local > src/integrations/supabase/types.ts`.
4. Run `npx supabase test db` again → expected **PASS**.
5. Inspect generated types for the five RPCs and every new table/view/enum.

**Acceptance criteria**

- No generated type is hand-edited or cast away with `any`/`never` to hide drift.
- Clean reset and complete database tests are green in one run.
- Task 09 remains blocked until this task is complete.

## Task 09: Create Next.js 16 Foundation and Supabase SSR Authentication

**Requirements:** Stack mandate; FR-701–FR-704.

**Files**

- Modify `package.json`, `package-lock.json`, `tsconfig.json`, `.env.example`.
- Create `next.config.ts`, `next-env.d.ts`, `vitest.config.ts`, `playwright.config.ts`.
- Create `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/not-found.tsx`, `src/app/error.tsx`.
- Create `src/app/login/page.tsx`, `src/app/login/actions.ts`.
- Create `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/proxy.ts`, `src/lib/supabase/proxy.test.ts`, `src/proxy.ts`.

**TDD steps**

1. Add proxy tests for protected redirect, authenticated pass-through, and login redirect.
2. Run `npm test -- --run src/lib/supabase/proxy.test.ts` → expected **FAIL** before proxy/client implementation.
3. Install/configure Next.js, `@supabase/ssr`, Vitest, Testing Library, Playwright, and XLSX parsing; keep existing Radix/Tailwind dependencies.
4. Implement request-scoped cookie clients and `getClaims()` authorization; never import service-role credentials.
5. Implement root/error/not-found/login files with Indonesian labels and inline errors.
6. Run `npm test -- --run src/lib/supabase/proxy.test.ts && npm run typecheck && npm run build` → expected **PASS**.

**Acceptance criteria**

- Follows 4-stage design workflow.
- Responsive at all breakpoints.
- Scripts are `dev`, `build`, `start`, `lint`, `typecheck`, `test`, and `test:e2e`.
- Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are public.
- Root document uses `lang="id"`; protected pages cannot render unauthenticated.

## Task 10: Define Event Schemas and Simulation/File Adapters

**Requirements:** BR-08–BR-09; FR-401, FR-408–FR-410.

**Files**

- Create `src/lib/stock-events/schema.ts`, `src/lib/stock-events/schema.test.ts`.
- Create `src/lib/stock-events/adapters/simulation.ts`.
- Create `src/lib/stock-events/adapters/file.ts`, `src/lib/stock-events/adapters/file.test.ts`.

**TDD steps**

1. Write failing tests for every envelope field, each event payload, duplicate item references, positive quantities, CSV row errors, and XLSX row errors.
2. Run `npm test -- --run src/lib/stock-events` → expected **FAIL**.
3. Implement Zod schemas and pure adapters; adapters return events/errors and perform no I/O.
4. Run `npm test -- --run src/lib/stock-events` → expected **PASS**.

**Acceptance criteria**

- `StockEvent` exactly matches the approved external seam.
- File errors preserve one-based source row numbers.
- No adapter imports Supabase or a Server Action.

## Task 11: Create Authenticated Server Read Models

**Requirements:** BR-05, BR-11, BR-19; FR-103–FR-104, FR-205, FR-602, FR-605–FR-606.

**Files**

- Create `src/lib/queries/dashboard.ts`, `products.ts`, `ledger.ts`, `returns.ts`, `reconciliation.ts`.
- Create `src/lib/queries/read-models.test.ts`.

**TDD steps**

1. Test pure transformation of joined database rows into dashboard/product/ledger/return/reconciliation models.
2. Run `npm test -- --run src/lib/queries/read-models.test.ts` → expected **FAIL**.
3. Implement server-only query functions with the request-scoped authenticated client.
4. Run the same command → expected **PASS**.

**Acceptance criteria**

- Balance fields originate from summary/read views, never `batches.current_stock`.
- Drill-down preserves actor/source/allocation/correction links.
- No service-role client or browser hook appears in query files.

## Task 12: Create Validated Manual Stock Server Actions

**Requirements:** BR-02, BR-13–BR-15; FR-301–FR-305.

**Files**

- Create `src/app/(authenticated)/movements/actions.ts`, `schemas.ts`, `actions.test.ts`.

**TDD steps**

1. Test unauthenticated requests, invalid UUID/quantity, fixed enums, missing references, RPC errors, and success results.
2. Run `npm test -- --run 'src/app/(authenticated)/movements/actions.test.ts'` → expected **FAIL**.
3. Implement `recordGoodsInAction`, `recordManualOutAction`, and `correctLedgerEntryAction` with `ActionResult<T>`.
4. Run the same command → expected **PASS**.

**Acceptance criteria**

- Each action invokes exactly one matching RPC.
- No `.from(...).insert/update/delete` exists in the action module.
- Validation errors remain field-addressable in Indonesian UI.

## Task 13: Create Marketplace Event Server Actions

**Requirements:** BR-08–BR-09; FR-401–FR-410.

**Files**

- Create `src/app/(authenticated)/simulation/actions.ts`, `actions.test.ts`.

**TDD steps**

1. Test all four external event types, duplicate results, conflicts, malformed imports, and mixed valid/invalid rows.
2. Run `npm test -- --run 'src/app/(authenticated)/simulation/actions.test.ts'` → expected **FAIL**.
3. Implement `submitStockEventAction` and `importStockEventsAction`; invoke only `process_stock_event`.
4. Run the same command → expected **PASS**.

**Acceptance criteria**

- Stable caller-visible idempotency keys are preserved unchanged.
- Import does not silently drop invalid rows or submit them.
- No direct order/return/event/ledger table write exists.

## Task 14: Create Return Inspection and Reconciliation Server Actions

**Requirements:** BR-05–BR-07, BR-16–BR-17; FR-501–FR-506, FR-602–FR-606.

**Files**

- Create `src/app/(authenticated)/returns/actions.ts`, `actions.test.ts`.
- Create `src/app/(authenticated)/reconciliation/actions.ts`, `actions.test.ts`.

**TDD steps**

1. Test explicit condition, component quantity bounds, sellable batch fields, damaged/lost mapping, stocktake snapshots, and stale/invalid counts.
2. Run `npm test -- --run 'src/app/(authenticated)/returns/actions.test.ts' 'src/app/(authenticated)/reconciliation/actions.test.ts'` → expected **FAIL**.
3. Implement `inspectReturnAction`, `certifyStocktakeAction`, and `runDailyReconciliationAction`.
4. Run the same command → expected **PASS**.

**Acceptance criteria**

- Inspection uses `process_stock_event`; certification uses `certify_stocktake`.
- No per-row browser-authored stocktake writes.
- Out-of-range return quantities fail before RPC invocation.

## Task 15: Build Authenticated Shell and Stock Dashboard

**Requirements:** PRD 4.1; FR-103–FR-104, FR-602, FR-606.

**Files**

- Create `src/app/(authenticated)/layout.tsx`, `dashboard/page.tsx`.
- Create `src/components/layout/app-shell.tsx`, `app-sidebar.tsx`.
- Create `src/components/dashboard/stock-summary.tsx`, `worklist.tsx`, `dashboard.test.tsx`.

**TDD/design steps**

1. Follow Layout → Theme → Animation → Implementation, reusing the approved existing palette and Radix primitives.
2. Test allowed navigation, summary cards, anomaly/claim/expiry states, empty state, and read error state.
3. Run `npm test -- --run src/components/dashboard/dashboard.test.tsx` → expected **FAIL**.
4. Implement Server Component reads plus minimal Client Components.
5. Run the same command and `npm run typecheck` → expected **PASS**.

**Acceptance criteria**

- Follows 4-stage design workflow.
- Responsive at all breakpoints.
- 44px controls, 14px operational text, visible focus, and direct Indonesian copy.
- Sidebar contains no promo, reference-data, user-role, or onboarding route.

## Task 16: Migrate Product, Batch, and Versioned Bundle Workflows

**Requirements:** BR-04; FR-101–FR-106, FR-301, FR-407.

**Files**

- Create `src/app/(authenticated)/products/page.tsx`, `products/bundles/page.tsx`.
- Create `src/components/products/goods-in-form.tsx`, `product-batch-list.tsx`, `bundle-recipe-form.tsx`, `products.test.tsx`.

**TDD/design steps**

1. Test goods-in required fields, summary balance display, expiry warnings, version creation, and missing-recipe copy.
2. Run `npm test -- --run src/components/products/products.test.tsx` → expected **FAIL**.
3. Apply the 4-stage workflow and implement responsive cards/tables and Server Action forms.
4. Run the same command → expected **PASS**.

**Acceptance criteria**

- Follows 4-stage design workflow.
- Responsive at all breakpoints.
- Goods-in never inserts batches directly from the browser.
- Recipe edits create versions; no old line is updated/deleted.

## Task 17: Migrate Manual Movement, Ledger, and Correction Workflows

**Requirements:** BR-02, BR-11, BR-13–BR-15; FR-202, FR-205, FR-301b, FR-302–FR-305, FR-604–FR-605.

**Files**

- Create `src/app/(authenticated)/movements/page.tsx`, `movements/new/page.tsx`.
- Create `src/components/movements/manual-out-form.tsx`, `commit-preview.tsx`, `ledger-table.tsx`, `correction-form.tsx`, `movements.test.tsx`.

**TDD/design steps**

1. Test fixed reason/channel inputs, mandatory reference, no batch selector, projected stock, exact preview fields, correction eligibility, and duplicate-submit lock.
2. Run `npm test -- --run src/components/movements/movements.test.tsx` → expected **FAIL**.
3. Apply the 4-stage workflow and implement forms/read models/actions.
4. Run the same command → expected **PASS**.

**Acceptance criteria**

- Follows 4-stage design workflow.
- Responsive at all breakpoints.
- Exactly one confirmation exists at permanent commit.
- Ledger and correction remain append-only and visibly distinct from opname.

## Task 18: Migrate Marketplace Simulation and File Import Workflow

**Requirements:** BR-01, BR-04, BR-08–BR-09, BR-16; FR-401–FR-410.

**Files**

- Create `src/app/(authenticated)/simulation/page.tsx`.
- Create `src/components/simulation/event-form.tsx`, `order-worklist.tsx`, `file-import.tsx`, `simulation.test.tsx`.

**TDD/design steps**

1. Test four event types, channel cutoffs, partial item controls, bundles, idempotency visibility, CSV/XLSX errors, and no unnecessary confirmation.
2. Run `npm test -- --run src/components/simulation/simulation.test.tsx` → expected **FAIL**.
3. Apply the 4-stage workflow and connect only to event Server Actions.
4. Run the same command → expected **PASS**.

**Acceptance criteria**

- Follows 4-stage design workflow.
- Responsive at all breakpoints.
- Simulation/import behavior is adapter-only.
- Partial cancellation/return controls operate per component quantity.

## Task 19: Migrate Return Inspection and Claim Worklist

**Requirements:** BR-06–BR-07, BR-16; FR-501–FR-506, FR-606.

**Files**

- Create `src/app/(authenticated)/returns/page.tsx`, `returns/[id]/inspect/page.tsx`.
- Create `src/components/returns/return-inspection-form.tsx`, `claim-worklist.tsx`, `returns.test.tsx`.

**TDD/design steps**

1. Test no initial condition selection, component quantities, each condition, sellable batch fields, no-second-movement copy, and TikTok deadline.
2. Run `npm test -- --run src/components/returns/returns.test.tsx` → expected **FAIL**.
3. Apply the 4-stage workflow and implement explicit action controls.
4. Run the same command → expected **PASS**.

**Acceptance criteria**

- Follows 4-stage design workflow.
- Responsive at all breakpoints.
- Return condition is never silently chosen.
- Damaged and lost remain separate claims and never imply stock deduction.

## Task 20: Migrate Daily Reconciliation, Stocktake, and Drill-Down

**Requirements:** BR-05, BR-11, BR-17, BR-19; FR-602–FR-606.

**Files**

- Create `src/app/(authenticated)/reconciliation/daily/page.tsx`, `opname/page.tsx`, `report/page.tsx`.
- Create `src/components/reconciliation/daily-worklist.tsx`, `stocktake-form.tsx`, `ledger-drilldown.tsx`, `reconciliation.test.tsx`.

**TDD/design steps**

1. Test all mandatory anomaly classes, snapshot counts/diffs, one-shot certification, opening verification, and movement drill-down.
2. Run `npm test -- --run src/components/reconciliation/reconciliation.test.tsx` → expected **FAIL**.
3. Apply the 4-stage workflow and implement read models plus reconciliation actions.
4. Run the same command → expected **PASS**.

**Acceptance criteria**

- Follows 4-stage design workflow.
- Responsive at all breakpoints.
- Stocktake writes once through `certify_stocktake`.
- Opening verification is computed from linked records, not ledger updates.

## Task 21: Remove Obsolete TanStack and Out-of-Scope Paths

**Requirements:** Phase 2 scope/defaults; fully working zero-bug standard.

**Files**

- Delete `vite.config.ts`, `src/router.tsx`, `src/routeTree.gen.ts`, `src/server.ts`, `src/start.ts`, and `src/routes/` after route parity.
- Delete obsolete onboarding, promo-rule, reference-data, and users components/routes.
- Modify `package.json`, `package-lock.json`, `src/components/`, and `src/lib/` to remove unused framework/dead code.

**Verification steps**

1. Run `npm run lint && npm run typecheck && npm test && npm run build` → expected **PASS**.
2. Run repository searches for `@tanstack/react-router`, `@tanstack/react-start`, `vite`, `batches.current_stock`, direct browser `.insert(`/`.update(` on workflow tables, `TODO`, `FIXME`, `placeholder`, and debug `console.log`.
3. Expected result: no prohibited application references; legitimate test text or dependency lock metadata is reviewed explicitly.

**Acceptance criteria**

- Next App Router is the only routing/runtime framework.
- No dead route or out-of-scope control is reachable.
- Working Radix/Tailwind primitives are retained rather than rewritten.

## Task 22: Add Critical Operator-Cycle Playwright Coverage

**Requirements:** All release-blocking stock flows and operator accessibility requirements.

**Files**

- Create `e2e/auth.setup.ts`, `e2e/operator-cycle.spec.ts`, `e2e/accessibility.spec.ts`.

**TDD steps**

1. Write the operator cycle against a clean database and run `npm run test:e2e` → expected **FAIL** until selectors/flows are complete.
2. Cover login → goods-in → manual-out preview → Shopee/TikTok cutoff → partial cancellation → return conditions → correction → stocktake.
3. Assert summary and displayed balances after every permanent movement.
4. Add keyboard, focus, label, control-size, and mobile overflow checks.
5. Run `npm run build && npm run start` in the test web-server configuration, then `npm run test:e2e` → expected **PASS**.

**Acceptance criteria**

- Refresh/retry and double-click cannot double-apply stock.
- Both pre/post-cutoff cancellation paths are proven.
- Damaged/lost ledger row count remains unchanged.

## Task 23: Run Complete Local Release-Candidate Gate

**Requirements:** Fully working, zero-bug; all BR/FR trace rows.

**Files**

- Create `docs/superpowers/plans/2026-08-04-stock-remediation-release-evidence.md` with actual command output summaries and checksums.

**Verification steps**

Run exactly in order, stopping on first failure:

```bash
npx supabase db reset
npx supabase test db
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npx supabase migration list --linked
shasum -a 256 supabase/migrations/202608040001_stock_remediation_schema.sql supabase/migrations/202608040002_stock_write_rpcs.sql supabase/migrations/202608040003_stock_event_engine.sql
```

Expected result: every command exits 0; migration list shows the three local remediation migrations as pending remotely; evidence records versions, timestamps, and SHA-256 values.

**Acceptance criteria**

- No rerun hides a flaky first failure.
- No ignored test, lint suppression, or weakened assertion is introduced.
- Production remains untouched.

## Task 24: Deploy and Verify Vercel Preview Against Staging Supabase

**Requirements:** Live preview validation; no production mutation.

**Files**

- Create `src/app/api/health/route.ts`.
- Create `docs/superpowers/plans/2026-08-04-stock-remediation-preview-evidence.md`.

**Steps**

1. Run `npx vercel list --prod` and verify a production baseline already exists for the linked real project, or verify the linked project is staging-only. If neither is true, stop: Vercel documents that a new project's first deployment is production.
2. Run `npx vercel pull --yes --environment=preview`.
3. Confirm preview environment uses staging `NEXT_PUBLIC_SUPABASE_URL` and staging publishable key; confirm no service-role variable is public.
4. Run `PREVIEW_URL="$(npx vercel deploy --yes --logs)"`.
5. Run `npx vercel curl /api/health --deployment "$PREVIEW_URL" -- --fail --silent --show-error` → expected HTTP 200.
6. Run `PLAYWRIGHT_BASE_URL="$PREVIEW_URL" npm run test:e2e` → expected **PASS**.
7. Run `npx vercel logs --deployment "$PREVIEW_URL" --level error` → expected no application errors from the test window.
8. Record the immutable preview URL/ID, staging migration version, command results, and production migration checksums.

**Acceptance criteria**

- Preview and staging use no production database or production environment mutation.
- Auth, health, Server Actions, and complete operator cycle pass.
- Production task remains blocked.

## Task 25: Migrate and Deploy Production After Explicit Approval

**Status:** **BLOCKED** after Task 24. The only valid unblock instruction is an explicit user message approving the exact reviewed production migration and Vercel production deployment. A sufficient statement is: **“Approve production migration and deployment for stock-remediation.”**

**Requirements:** Approved design Security and Deployment sections; session production gate.

**Files**

- Create `docs/superpowers/plans/2026-08-04-stock-remediation-production-evidence.md` only after approval.

**Approved execution steps**

1. Re-read release and preview evidence; verify migration SHA-256 values match.
2. Run `mkdir -p .tmp/backups`.
3. Run `npx supabase db dump --linked --file .tmp/backups/stock-remediation-2026-08-04.sql` and verify the file is non-empty/restorable.
4. Run `npx supabase migration list --linked` and `npx supabase db push --linked --dry-run`; expected pending set is exactly the three `20260804000*` remediation migrations.
5. Record the current production Vercel deployment URL in `PREVIOUS_PRODUCTION_URL` for application rollback.
6. Run `npx supabase db push --linked`. On any failure, stop before Vercel deployment and report; do not repair history or auto-fix.
7. Run `PRODUCTION_URL="$(npx vercel deploy --prod --yes --logs)"`.
8. Run `npx vercel curl /api/health --deployment "$PRODUCTION_URL" -- --fail --silent --show-error` → expected HTTP 200.
9. Run the controlled production smoke subset for login, dashboard balance, one idempotent simulation retry, and reconciliation parity; do not seed or reset production.
10. Run `npx vercel logs --environment production --level error --since 5m` → expected no release errors.
11. If application smoke fails after a successful database migration, run `npx vercel rollback "$PREVIOUS_PRODUCTION_URL"`, verify recovery, and leave the additive database migration intact.

**Acceptance criteria**

- Approval, backup identifier, migration checksums/results, production deployment ID, live smoke results, and any rollback action are recorded.
- Ledger and summary parity is verified live without mutating ledger history.
- No automatic database rollback, migration rewrite, force push, commit, or unrelated fix occurs.

## Definition of Done

- All 25 task JSON acceptance criteria pass; Task 25 is completed only after explicit approval and live verification.
- Every permanent stock change is one or more immutable ledger inserts produced inside an authenticated RPC transaction.
- Duplicate/concurrent events cannot double-apply stock, and every displayed balance agrees with ledger aggregation and summary cache.
- The only reachable application is the responsive Next.js operator experience defined here.
- Local, preview/staging, and approved production evidence files contain real results and no placeholders.

## Skill Availability Note

The repository-local `hallmark` and `supabase` skills were not present when this plan was written; only the task-management skill was available. UI and database implementation agents must state this in their completion summaries unless those skills become available before execution.
