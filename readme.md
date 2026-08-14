
# Stok Akurat

Sistem pencatatan dan rekonsiliasi stok untuk brand skincare Indonesia dengan
produksi maklon, sekitar 70 SKU, serta penjualan melalui Shopee dan TikTok Shop.

## Prinsip Utama

- `stock_ledger` adalah sumber kebenaran tunggal dan append-only.
- Semua perubahan stok harus meninggalkan jejak audit.
- Saldo dibaca dari `stock_balance_summary` dan dapat diverifikasi dari ledger.
- Alokasi stok menggunakan FEFO secara otomatis.
- Event marketplace memakai idempotency key agar retry tidak menggandakan stok.
- Retur layak jual masuk ke batch baru; retur rusak/hilang tidak membuat movement kedua.
- Sistem hanya memiliki satu role: `admin`.

## Fitur

- Produk, batch, expiry, dan saldo stok.
- Barang masuk maklon dan pengeluaran manual.
- Reason dan channel terpisah.
- Validasi referensi untuk bonus, promo, dan sample.
- Simulasi event Shopee/TikTok: reservasi, shipped/in-transit, pembatalan parsial, dan retur.
- Bundle dengan resep yang versioned.
- Koreksi ledger melalui reversal append-only.
- Stocktake, rekonsiliasi, dan worklist klaim retur.

## Batasan Scope

- Tidak mencatat harga atau nilai uang.
- Tidak ada integrasi API marketplace nyata pada fase ini.
- Satu gudang dan satu role admin.
- Notifikasi fase ini bersifat in-app.
- Barcode, cetak label, dan multi-warehouse belum dibangun.

## Stack

- TypeScript, React, Vite/TanStack Start
- Supabase Auth dan PostgreSQL
- Supabase migrations, RPC, RLS, dan pgTAP

Dokumen requirement menetapkan target Next.js + TypeScript + Supabase. Migrasi
framework aplikasi ke Next.js masih merupakan pekerjaan terpisah.

## Menjalankan Lokal

```bash
npm install
npm run dev
```

Untuk database lokal:

```bash
supabase start
supabase db reset
supabase test db
```

Jangan commit `.env`, service-role key, password database, atau kredensial login.

## Referensi

- `docs/BRIEF.md` - brief dan Sync Update Phase 2.
- `docs/BRD.md` - business requirements.
- `docs/PRD.md` - product requirements dan acceptance criteria.
- `docs/SRS.md` - functional, security, dan data requirements.
