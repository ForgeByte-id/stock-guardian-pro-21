# Stock Reconciliation Remediation Design

## Goal

Make Stok Akurat conform to the Phase 2 specification: every stock change is
ledger-backed, idempotent, transaction-safe, traceable, usable by warehouse
operators, implemented with Next.js + TypeScript + Supabase/Postgres, and
deployable to Vercel.

## Authoritative requirements

The Phase 2 Sync Update in `docs/BRIEF.md` controls where Phase 1 differs.
Implementation is traced to BR-01–BR-19 and FR-101–FR-704. The following rules
are release blockers:

- `stock_ledger` is immutable and append-only.
- No application role can update, delete, or truncate ledger rows.
- All permanent stock writes use authenticated RPCs called by Server Actions.
- Shopee deducts at `SHIPPED`; TikTok Shop deducts at `IN_TRANSIT`.
- FEFO is automatic, deterministic, and safe under concurrent allocation.
- Marketplace events are idempotent and processed through one event interface.
- Bundle orders retain and use their recipe version.
- Sellable returns enter a new zero-balance return batch through one ledger entry.
- Damaged and lost returns create claims without a second stock deduction.
- Partial cancellation and partial return are represented per component quantity.
- Entry correction and stocktake adjustment remain distinct ledger sources.
- Estimated opening balances remain identifiable until the first certified count.
- No price, monetary valuation, extra role, or extra warehouse is introduced.

## Architecture

### Stock engine module

The database is the stock engine module. Its small public interface is:

- `record_goods_in(payload jsonb)`
- `record_manual_out(payload jsonb)`
- `process_stock_event(payload jsonb)`
- `correct_ledger_entry(payload jsonb)`
- `certify_stocktake(payload jsonb)`
- read-only reconciliation and balance views

Complex allocation, locking, recipe expansion, reversals, return handling,
idempotency, actor attribution, and summary maintenance remain private database
implementation. Browser code never writes workflow tables directly.

### Event seam

Simulation, file import, and future webhooks are adapters at one event seam.
They submit the same validated event envelope:

```ts
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
```

`process_stock_event` claims `idempotencyKey` and completes the entire state
transition in one database transaction. A duplicate with an identical payload
returns the prior result. A duplicate key with different content is rejected.

### Balance model

Definitive balance is always ledger aggregation. `stock_balance_summary` is a
transactional cache maintained by atomic signed deltas under a locked summary
row. Reconciliation independently compares summary values with ledger sums.
Legacy `batches.current_stock` is no longer read by application code and is not
allowed to become an independent balance source.

### FEFO and fulfillment allocations

The allocator locks candidate summary rows using deterministic ordering:
`expiry_date`, `created_at`, then `batch_id`. Expired or inactive batches are
excluded. Every fulfilled quantity is persisted in an immutable allocation row
that links order item component, batch, quantity, and fulfillment event. Later
cancellation reverses those exact allocation rows.

### Bundles

Order creation snapshots the active `bundle_recipe_version_id` and expanded
component quantities. Shipment reads this snapshot, never the mutable active
recipe. Missing recipes place the item in manual-review status without deducting
stock.

### Returns

Return lines reference fulfilled component quantities. Cumulative returned
quantity cannot exceed fulfilled quantity minus prior returns. A sellable line
creates a new batch with `origin = retur` and zero starting balance, followed by
one `return_resellable` ledger entry. Damaged and lost lines create distinct
claim records and no stock movement.

### Corrections and stocktakes

Corrections link to the original ledger row and are bounded by its remaining
correctable quantity. A unique constraint prevents repeated full reversal.
Stocktake opening snapshots, counts, ledger adjustments, session closure, and
opening-balance verification complete in one RPC transaction.

Ledger rows remain immutable. Opening-balance verification is represented in a
separate linked verification record and exposed as computed status instead of
updating an existing ledger row.

## Security

- RLS is enabled on every exposed table.
- Authenticated users receive read access only where direct writes are unsafe.
- RPCs derive actors from `auth.uid()` and reject unauthenticated callers.
- `SECURITY DEFINER` functions use an empty search path and fully qualified names.
- `EXECUTE` is revoked from `PUBLIC` and `anon`, then granted explicitly.
- Service-role credentials never use a `NEXT_PUBLIC_` variable.
- Server Actions validate input with Zod before invoking RPCs.
- Remote migrations require a backup and a separate production approval gate.

## Next.js application

Next.js 16 App Router replaces TanStack Start/Vite. Server Components perform
authenticated reads. Client Components are limited to interactive forms and
tables. Server Actions are the only application mutation entry points. Supabase
SSR clients follow the current `@supabase/ssr` browser/server/proxy pattern.

Existing Radix UI primitives and Tailwind styles are reused where correct.
Out-of-scope reference-data CRUD, disconnected promo rules, and dead onboarding
are removed instead of ported.

## Operator interface

- Permanent manual writes show current and projected stock before commit.
- Goods-in captures product, batch code, received/production date, expiry, quantity,
  and reference.
- Return inspection uses one explicit action and never silently preselects a
  different condition.
- Primary controls are at least 44px; operational text is at least 14px.
- Forms have associated labels, inline errors, visible focus, and duplicate-submit
  protection.
- Mobile views prioritize essential values and actions instead of wide tables.
- Copy uses direct Indonesian warehouse terminology.

## Testing

Database integration tests are the primary proof for stock correctness. They
cover sequential and concurrent FEFO, both marketplace cutoffs, cancellation
before/after cutoff, partial operations, duplicate and out-of-order events,
bundle versions, all return conditions, corrections, opening verification,
stocktake atomicity, ledger immutability, RLS bypass attempts, and summary parity.

Vitest covers event schemas and pure transformations. Playwright covers login and
the critical operator cycle. A release candidate must pass database reset, tests,
lint, typecheck, production build, preview smoke tests, and a controlled staging
cycle.

## Deployment

Vercel receives separate preview and production environments. Preview uses a
staging Supabase project. Production is not migrated or deployed until local and
preview checks pass, a backup is confirmed, the exact migration is reviewed, and
the user approves the production operation.

## Explicit non-goals

Real Shopee/TikTok API integration, multi-warehouse support, editable reason or
channel dictionaries, barcode scanning, label printing, prices, valuation,
email/WhatsApp notifications, and additional roles remain out of scope.
