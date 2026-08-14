# Software Requirements Specification (SRS)

## Stok Akurat — Sistem Rekonsiliasi Stok

|                 |                                                          |
| --------------- | -------------------------------------------------------- |
| **Dokumen**     | SRS                                                      |
| **Terkait**     | BRD v2.0, PRD v2.0, Sync Update Phase 2 v2 (13 Jun 2026) |
| **Stack Wajib** | Next.js + TypeScript + Supabase (Postgres)               |
| **Versi**       | 2.0 — supersedes v1.0                                    |

> **[v2]** menandai kebutuhan yang berubah/baru dari Sync Update Phase 2. Di mana v1 dan v2 berbeda, **v2 yang mengikat**.

---

## 1. Pendahuluan

### 1.1 Tujuan

Dokumen ini merinci kebutuhan fungsional, non-fungsional, dan model data untuk sistem Stok Akurat, sebagai acuan implementasi tim pengembang, sesuai standar rilis **fully working, zero-bug** yang ditetapkan Sync Update Phase 2.

### 1.2 Definisi & Istilah

| Istilah                                 | Arti                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Ledger / Buku Besar Pergerakan Stok** | Log _append-only_ dari setiap perubahan kuantitas stok; sumber kebenaran tunggal. Hak `UPDATE`/`DELETE` dicabut di level DB **[v2]**                         |
| **Batch**                               | Kelompok stok satu produk dari satu kedatangan/produksi/retur, dengan tanggal kedaluwarsa sendiri. **[v2]** Batch bisa punya `origin`: `maklon` atau `retur` |
| **FEFO**                                | _First Expired, First Out_ — alokasi keluar diprioritaskan pada batch dengan tanggal kedaluwarsa terdekat                                                    |
| **Bundle / Resep**                      | Definisi bahwa 1 unit SKU bundle terdiri dari kombinasi kuantitas produk satuan tertentu. **[v2]** Resep di-versioning                                       |
| **Movement / Pergerakan**               | Satu baris entri di ledger: arah, jumlah, produk, batch, reason, channel, `source_type`, referensi                                                           |
| **Rekonsiliasi Harian**                 | Pemeriksaan konsistensi internal catatan sistem                                                                                                              |
| **Stok Opname**                         | Pembandingan catatan sistem vs hitung fisik gudang                                                                                                           |
| **[v2] Koreksi Entri**                  | Reversal cepat untuk kesalahan input admin/operator, `source_type = manual_correction`, terpisah dari `opname_correction`                                    |
| **[v2] Claim/Loss Record**              | Catatan retur rusak/hilang untuk keperluan audit & klaim — **bukan** entri ledger stok                                                                       |
| **SHIPPED / IN_TRANSIT**                | Status pesanan Shopee/TikTok yang menjadi titik resmi pengurangan stok                                                                                       |
| **[v2] Event Interface**                | Kontrak data yang dipakai lapisan import/simulasi dan (nanti) webhook asli untuk berbicara ke Stock Engine                                                   |
| **[v2] Idempotency Key**                | Identitas unik per event eksternal agar retry tidak diproses dua kali                                                                                        |

### 1.3 Referensi

- BRD v2.0, PRD v2.0
- Brief Bounty VibeDev v1 — Sistem Rekonsiliasi Stok
- **Sync Update Phase 2 v2 (13 Jun 2026)** — dokumen pengoreksi/penajam arah teknis
- Contoh data mentah klien (spreadsheet Juni 2026) — Lampiran B, **hanya contoh untuk testing, bukan skema wajib**

### 1.4 Standar Kualitas Rilis — **[v2]**

- **Fully working, zero-bug**: semua fungsi jalan end-to-end, tidak ada placeholder/TODO/tombol mati/alur setengah jadi.
- **Siap integrasi API + webhook asli, re-setup minimal**: lapisan import adalah adapter di belakang _event interface_; mengganti adapter dengan webhook asli tidak boleh menyentuh Stock Engine.
- **Idempotency + append-only di level DB** adalah kebutuhan wajib, bukan nice-to-have.

---

## 2. Gambaran Umum Sistem

### 2.1 Perspektif Produk

Sistem berdiri sendiri, berbasis web, dipakai oleh gudang & admin brand dengan **1 role: Admin [v2]**. Sumber data pesanan/retur marketplace pada fase ini adalah lapisan **import/simulasi** yang menulis event dalam kontrak identik dengan webhook Shopee/TikTok asli, sehingga penggantian ke API sungguhan di masa depan tidak menyentuh logika inti.

### 2.2 Arsitektur Logis — **[v2: event interface eksplisit]**

```
┌───────────────────────────────┐
│  Adapter Sumber Event           │   <- dapat ditukar tanpa mengubah Stock Engine
│  (implementasi saat ini):        │
│   - Panel Simulasi Marketplace   │
│   - Impor File (CSV/XLSX)        │
│  (implementasi masa depan):      │
│   - Webhook Shopee/TikTok asli    │
└───────────────┬─────────────────┘
                │  menulis ke kontrak yang SAMA PERSIS:
                │  OrderCreated / OrderStatusChanged / OrderCancelled /
                │  ReturnSubmitted  (masing-masing dengan idempotency_key)
                ▼
┌───────────────────────────────┐
│        EVENT INTERFACE           │   <- satu-satunya pintu masuk event eksternal
└───────────────┬─────────────────┘
                ▼
┌───────────────────────────────┐
│         STOCK ENGINE             │   aturan bisnis inti:
│  - Order state machine           │   FEFO, bundle-split (versi resep),
│  - FEFO allocator                │   titik potong SHIPPED/IN_TRANSIT,
│  - Bundle splitter (versioned)   │   reversal batal, retur → batch baru
│  - Return handler                │   "retur", dsb.
└───────────────┬─────────────────┘
                │ menulis (via RPC/Server Action, bukan UPDATE langsung)
                ▼
┌───────────────────────────────┐
│   STOCK LEDGER (append-only,     │   hak UPDATE/DELETE dicabut di level DB
│   immutable, sumber kebenaran)   │
└───────────────┬─────────────────┘
                │ menjaga (dalam transaksi yang sama / trigger)
                ▼
┌───────────────────────────────┐
│  STOCK BALANCE SUMMARY (cache)   │   baca saldo O(1); selalu bisa
│  per product_id, batch_id        │   diverifikasi ulang dari ledger
└───────────────┬─────────────────┘
                ▼
   Dashboard, Rekonsiliasi, Laporan Selisih, Worklist Klaim
```

### 2.3 Karakteristik Pengguna

Lihat PRD Bagian 3. **[v2]** Seluruh pengguna memakai satu role akses (Admin); perbedaan persona bersifat fungsional-kebutuhan, bukan hak akses sistem.

### 2.4 Batasan Umum

- Tidak ada field harga/nilai uang di entitas manapun.
- Tidak ada operasi yang meng-_update_ saldo stok secara langsung; satu-satunya cara mengubah saldo adalah menambah entri ledger baru.
- **[v2]** Semua entri ledger _immutable_ — dikunci di level database (`REVOKE UPDATE, DELETE`), bukan hanya konvensi aplikasi.
- **[v2]** Reason (`offline/bonus/promo/sample/damaged/expired`) dan channel (`shopee/tiktok/offline/internal`) adalah enum tetap di kode, belum admin-editable.
- **[v2]** 1 gudang; skema data boleh dirancang terbuka untuk multi-gudang, implementasinya tidak dibangun.

---

## 3. Kebutuhan Fungsional

### 3.1 Modul: Manajemen Data Produk & Batch (FR-1xx)

| ID     | Kebutuhan                                                                                                                                                                                                                                                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-101 | Sistem harus menyediakan CRUD produk (kode SKU, nama, kategori opsional, ambang notifikasi kedaluwarsa dalam hari).                                                                                                                                                                                                                           |
| FR-102 | Sistem harus menyediakan pencatatan batch per produk: kode batch, tanggal produksi/masuk, tanggal kedaluwarsa, kuantitas awal, **[v2] `origin` (`maklon` / `retur`)**.                                                                                                                                                                        |
| FR-103 | Satu produk dapat memiliki lebih dari satu batch aktif secara bersamaan; sisa kuantitas per batch dibaca dari **stock_balance_summary** dan harus selalu dapat direkonsiliasi ulang dari agregasi ledger.                                                                                                                                     |
| FR-104 | Sistem harus menandai/menotifikasi (in-app) batch yang mendekati kedaluwarsa sesuai ambang hari yang dikonfigurasi per produk.                                                                                                                                                                                                                |
| FR-105 | Sistem harus menyediakan CRUD resep bundle: SKU bundle → daftar (produk komponen, kuantitas per unit bundle). **[v2]** Setiap perubahan resep membuat **versi baru** (`bundle_recipe_version`); versi lama tidak dihapus.                                                                                                                     |
| FR-106 | **[v2: diubah dari v1]** Daftar **channel** (`shopee/tiktok/offline/internal`) dan **reason** (`offline/bonus/promo/sample/damaged/expired`) adalah **enum tetap di kode** untuk Fase 2 ini — **bukan** data yang dapat di-CRUD admin. Desain skema boleh mengizinkan hal ini berubah jadi tabel referensi di masa depan tanpa migrasi besar. |

### 3.2 Modul: Buku Besar Pergerakan Stok / Stock Ledger (FR-2xx)

| ID     | Kebutuhan                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-201 | Setiap perubahan kuantitas stok — dari sumber manapun — **wajib** direpresentasikan sebagai satu entri baru pada `stock_ledger`. Tidak ada jalur sistem yang mengubah saldo tanpa melalui ledger.                                                                                                                                                                   |
| FR-202 | Setiap entri ledger minimal berisi: produk, batch, arah (in/out), kuantitas, `reason`, `channel` (nullable untuk entri non-marketplace), `source_type` (lihat FR-207), `source_ref_id`, **[v2] `reference_note`** (wajib jika reason ∈ {bonus, promo, sample}), timestamp, `created_by`, **[v2] `idempotency_key`** (nullable, unique bila diisi).                  |
| FR-203 | Saldo stok suatu produk/batch harus selalu dapat dihitung sebagai agregasi (SUM) seluruh entri ledger terkait, sebagai kebenaran definitif — terlepas dari mekanisme cache yang dipakai untuk pembacaan cepat (lihat FR-208).                                                                                                                                       |
| FR-204 | **[v2]** Entri ledger _append-only_ dikunci di **level database**: privilege `UPDATE` dan `DELETE` pada tabel `stock_ledger` dicabut dari role aplikasi; satu-satunya jalur tulis adalah RPC/Server Action yang melakukan `INSERT`. Kesalahan dikoreksi lewat entri penyeimbang baru (Koreksi Entri, FR-301b), bukan mengubah entri lama.                           |
| FR-205 | Sistem harus menyediakan riwayat jurnal yang dapat difilter per produk, per `reason`/`channel`, per rentang tanggal, per `source_type` (termasuk memisahkan `manual_correction` dari `opname_correction`).                                                                                                                                                          |
| FR-206 | **[v2]** `source_type` yang wajib didukung: `goods_in_maklon`, `manual_out`, `order_fulfillment`, `order_cancel_reversal`, `return_resellable`, `manual_correction`, `opname_correction`, `initial_balance`.                                                                                                                                                        |
| FR-207 | **[v2 baru]** Setiap `INSERT` ke `stock_ledger` yang berasal dari event eksternal (order/retur) wajib menyertakan `idempotency_key`; jika key yang sama sudah pernah diproses, sistem harus menolak/mengabaikan pemrosesan ulang tanpa membuat entri duplikat.                                                                                                      |
| FR-208 | **[v2 baru]** Sistem harus menjaga tabel/struktur ringkasan saldo (`stock_balance_summary`) per `product_id`+`batch_id`, diperbarui dalam **transaksi yang sama** (atau trigger yang setara secara konsistensi) dengan `INSERT` ke ledger, sehingga pembacaan saldo untuk dashboard bersifat O(1) dan tidak melakukan `SUM` _full-scan_ ledger pada setiap request. |

### 3.3 Modul: Pencatatan Pergerakan Manual (FR-3xx)

| ID      | Kebutuhan                                                                                                                                                                                                                                                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-301  | Sistem harus menyediakan form "Barang Masuk dari Maklon" yang menghasilkan batch baru (`origin = maklon`) beserta entri ledger `goods_in_maklon`.                                                                                                                                                                             |
| FR-301b | **[v2 baru]** Sistem harus menyediakan aksi **"Koreksi Entri"**: memilih satu entri ledger yang salah, menghasilkan entri pembalik baru dengan `source_type = manual_correction` dan `source_ref_id` menunjuk ke entri asal yang dikoreksi. Tidak ada edit/hapus terhadap entri asal.                                         |
| FR-302  | Sistem harus menyediakan form "Pergerakan Keluar Manual" dengan dua input wajib terpisah: **reason** (`offline/bonus/promo/sample/damaged/expired`) dan **channel** (`offline/internal`).                                                                                                                                     |
| FR-302b | **[v2 baru]** Jika `reason` ∈ {`bonus`, `promo`, `sample`}, field `reference_note` (nama campaign/catatan approval) wajib diisi sebelum entri dapat disimpan.                                                                                                                                                                 |
| FR-303  | Pada pergerakan keluar manual, alokasi batch dilakukan otomatis mengikuti FEFO (FR-601); operator tidak disodori pilihan batch.                                                                                                                                                                                               |
| FR-304  | Form input dirancang untuk operator non-teknis: field minimal, validasi jelas, satu layar.                                                                                                                                                                                                                                    |
| FR-305  | **[v2 baru]** Setiap penulisan manual **permanen** (FR-301, FR-301b, FR-302) wajib melewati **layar konfirmasi/preview** yang menampilkan: produk, kuantitas, reason, channel, dan proyeksi dampaknya terhadap available stock — sebelum tombol final ditekan. Ini satu-satunya titik friksi yang disengaja dalam alur input. |
| FR-306  | **[v2 baru]** Entri stok awal (opening balance) dicatat dengan `source_type = initial_balance` dan flag `is_unverified = true`; flag ini di-set `false` otomatis ketika sesi opname pertama yang mencakup produk tersebut disahkan (lihat FR-603).                                                                            |

### 3.4 Modul: Adapter Sumber Event — Import & Simulasi Pesanan Marketplace (FR-4xx)

| ID     | Kebutuhan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-401 | Sistem harus menyediakan panel simulasi untuk membuat pesanan dummy (channel Shopee/TikTok), berisi satu atau lebih SKU (termasuk SKU bundle), yang menulis event `OrderCreated` ke Event Interface (lihat §2.2) — **bukan** memanggil Stock Engine secara langsung dari kode UI.                                                                                                                                                                                                               |
| FR-402 | Pesanan baru berstatus reservasi dan **tidak** menyentuh ledger.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| FR-403 | Sistem harus mendukung transisi status mengikuti siklus resmi tiap marketplace, minimal: Shopee (`UNPAID → PROCESSING → SHIPPED → DELIVERED`), TikTok (`PENDING → PROCESSING → IN_TRANSIT → DELIVERED`), via event `OrderStatusChanged`.                                                                                                                                                                                                                                                        |
| FR-404 | Saat status mencapai `SHIPPED` (Shopee) atau `IN_TRANSIT` (TikTok), Stock Engine secara otomatis membuat entri ledger `order_fulfillment` untuk seluruh item pesanan (bundle dipecah sesuai FR-105, memakai versi resep yang berlaku **saat order dibuat** — lihat FR-407), teralokasi via FEFO.                                                                                                                                                                                                |
| FR-405 | Sistem harus menyediakan aksi "Batalkan Pesanan" (penuh atau **[v2] parsial per item**). Jika dibatalkan **sebelum** titik potong (FR-404), tidak ada perubahan ledger (hanya lepas reservasi). Jika dibatalkan **setelah** titik potong, sistem otomatis membuat entri ledger `order_cancel_reversal` sejumlah item yang dibatalkan, ke batch asal alokasi.                                                                                                                                    |
| FR-406 | Sistem harus menyediakan event `ReturnSubmitted` yang menghasilkan `return_case` berstatus "menunggu inspeksi", terhubung ke pesanan asal (dan item spesifik untuk retur parsial); event ini **tidak** langsung mengubah saldo stok. `created_at` event ini menjadi acuan tenggat klaim TikTok (FR-506).                                                                                                                                                                                        |
| FR-407 | **[v2]** Saat order dibuat, sistem mencatat `bundle_recipe_version_id` yang berlaku pada saat itu untuk tiap item bundle di order tersebut. Saat titik potong tercapai (FR-404), pemecahan ke produk satuan **wajib** memakai versi resep yang tersimpan di order — bukan versi resep terbaru — sehingga mengedit resep tidak mengubah perhitungan order lama. Jika versi resep yang tersimpan sudah tidak ada / order dibuat sebelum resep terdaftar, item ditandai "perlu penanganan manual". |
| FR-408 | Adapter (panel simulasi & impor file) harus diimplementasikan sebagai lapisan terpisah yang **hanya** menghasilkan event ke Event Interface dengan kontrak yang identik dengan yang akan dipakai webhook Shopee/TikTok asli nanti. Tidak ada logika stok yang ditulis khusus untuk simulasi.                                                                                                                                                                                                    |
| FR-409 | Sistem harus menyediakan jalur impor file (CSV/XLSX) untuk memasukkan data pesanan/retur secara batch, menghasilkan event dengan kontrak yang sama seperti FR-408.                                                                                                                                                                                                                                                                                                                              |
| FR-410 | **[v2 baru]** Setiap event yang masuk ke Event Interface wajib membawa `idempotency_key`; Event Interface menolak/mengabaikan event dengan key yang sudah pernah diproses sebelumnya (lihat FR-207).                                                                                                                                                                                                                                                                                            |

### 3.5 Modul: Penanganan Retur (FR-5xx) — **[v2: direvisi signifikan]**

| ID     | Kebutuhan                                                                                                                                                                                                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-501 | Setiap retur tercatat dengan status awal "menunggu inspeksi" (`return_case.status = pending_inspection`), tidak memengaruhi saldo stok.                                                                                                                                                       |
| FR-502 | Sistem harus menyediakan aksi "Proses Retur Manual" bagi gudang untuk menetapkan kondisi retur: **Layak Jual**, **Rusak**, atau **Hilang di Ekspedisi**, per item (mendukung retur parsial dan retur bundle per komponen).                                                                    |
| FR-503 | **[v2]** Untuk kondisi **Layak Jual**: sistem membuat entri ledger `return_resellable` (arah masuk), dialokasikan ke **batch baru** dengan `origin = retur` (bukan batch asal pengiriman), karena tanggal kedaluwarsa batch asal sering tidak dapat dipastikan lagi setelah barang beredar.   |
| FR-504 | **[v2]** Untuk kondisi **Rusak**: sistem **tidak** membuat entri ledger stok kedua — stok sudah terpotong saat `order_fulfillment` (FR-404) dan tidak boleh dihitung dua kali. Sistem membuat **claim/loss record** (entitas terpisah dari ledger) berstatus `damaged` untuk keperluan audit. |
| FR-505 | **[v2]** Untuk kondisi **Hilang di Ekspedisi**: sama seperti FR-504 (tidak ada ledger movement kedua), namun claim/loss record berstatus `lost_in_transit` — dipisahkan dari `damaged` karena proses klaim ke ekspedisi berbeda dari proses klaim barang rusak.                               |
| FR-506 | **[v2]** Khusus retur kanal TikTok, sistem menghitung sisa hari menuju batas klaim 40 hari sejak **`created_at` retur diajukan** (FR-406) — bukan sejak `IN_TRANSIT` atau tanggal diterima pembeli — dan menampilkan pengingat in-app saat mendekati/melewati batas.                          |

### 3.6 Modul: Rekonsiliasi (FR-6xx)

| ID     | Kebutuhan                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-601 | **Alokasi FEFO**: setiap kali sistem perlu mengurangi stok suatu produk, sistem memilih batch aktif (saldo > 0) dengan tanggal kedaluwarsa paling dekat terlebih dahulu, melanjutkan ke batch berikutnya bila kuantitas batch pertama tidak mencukupi.                                                                                                                                                       |
| FR-602 | **Rekonsiliasi harian**: proses (terjadwal dan/atau dipicu manual) yang memeriksa konsistensi internal, minimal: saldo batch tidak negatif, saldo ringkasan (`stock_balance_summary`) konsisten dengan agregasi ledger, tidak ada pesanan berstatus lolos titik potong tanpa entri ledger terkait, retur "menunggu inspeksi" lebih dari N hari. Hasilnya berupa worklist anomali yang ditandai di dashboard. |
| FR-603 | **Sesi Stok Opname**: (a) membuka sesi, (b) input hitung fisik per produk/batch, (c) menghitung selisih = saldo tercatat saat sesi dibuka − hitung fisik, (d) menampilkan pergerakan ledger sejak opname sebelumnya sebagai konteks, (e) mengesahkan sesi → entri `opname_correction` dibuat, bertaut ke sesi, dan **[v2]** flag `is_unverified` pada entri `initial_balance` produk terkait di-set `false`. |
| FR-604 | Entri `manual_correction` (FR-301b) dan `opname_correction` (FR-603) harus dapat dibedakan secara jelas by `source_type`, untuk analisis pola selisih dari waktu ke waktu — memisahkan "salah input" dari "selisih fisik riil".                                                                                                                                                                              |
| FR-605 | **Laporan/Drill-down Selisih**: untuk setiap kejanggalan (harian) atau selisih (opname), sistem harus dapat menampilkan seluruh entri ledger relevan dalam rentang terkait, sehingga pengguna bisa menelusuri kontribusi tiap pergerakan terhadap selisih akhir.                                                                                                                                             |
| FR-606 | **[v2 baru]** Worklist terpisah untuk **klaim retur**: menampilkan `claim/loss record` berstatus `damaged` atau `lost_in_transit` yang belum selesai, dan retur TikTok yang mendekati/melewati batas 40 hari (FR-506).                                                                                                                                                                                       |

### 3.7 Modul: Akses (FR-7xx) — **[v2: disederhanakan]**

| ID     | Kebutuhan                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-701 | Sistem harus menyediakan pendaftaran & login pengguna (email + password) via Supabase Auth.                                                                                                                                                                                                                                                                              |
| FR-702 | **[v2, mengganti FR-702 v1]** Sistem menggunakan **1 role**: `admin`. Tidak ada sub-role operator terpisah dan tidak ada alur approval berjenjang untuk Koreksi Entri atau pengesahan sesi opname.                                                                                                                                                                       |
| FR-703 | Setiap entri ledger, claim/loss record, dan sesi opname tetap mencatat ID pengguna pelaku (`created_by`) untuk audit trail, meskipun hanya ada satu role.                                                                                                                                                                                                                |
| FR-704 | **[v2]** Row Level Security (RLS) Supabase diterapkan untuk memastikan hanya pengguna **terautentikasi** yang dapat membaca/menulis data (bukan untuk membedakan tingkat akses antar role, karena hanya ada satu role). Semua penulisan ke `stock_ledger` tetap wajib lewat RPC/Server Action (FR-204), tidak langsung dari klien meski melalui pengguna terautentikasi. |

---

## 4. Model Data (Konseptual)

| Entitas                             | Field Kunci                                                                                                                                                                                                                    | Catatan                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **product**                         | id, sku, name, category, expiry_alert_days                                                                                                                                                                                     | Tidak ada field harga                                                                              |
| **product_batch**                   | id, product_id, batch_code, expiry_date, received_at, **`origin`** (`maklon`\|`retur`)                                                                                                                                         | **[v2]** origin membedakan batch dari maklon vs batch hasil retur layak jual                       |
| **bundle_recipe**                   | id, bundle_sku                                                                                                                                                                                                                 | Induk resep                                                                                        |
| **bundle_recipe_version**           | id, bundle_recipe_id, version_no, effective_from, is_active                                                                                                                                                                    | **[v2 baru]** — versioning resep                                                                   |
| **bundle_recipe_line**              | id, recipe_version_id, product_id (komponen), qty_per_bundle                                                                                                                                                                   | **[v2]** terhubung ke versi, bukan langsung ke bundle                                              |
| **stock_ledger**                    | id, product_id, batch_id, direction, qty, reason, channel (nullable), source_type, source_ref_id, **reference_note** (nullable, wajib untuk bonus/promo/sample), **idempotency_key** (nullable unique), created_at, created_by | **Append-only, immutable di level DB [v2]**                                                        |
| **stock_balance_summary**           | product_id, batch_id, balance_qty, updated_at                                                                                                                                                                                  | **[v2 baru]** — diperbarui transaksional bersamaan insert ledger, untuk baca O(1)                  |
| **marketplace_order**               | id, channel, external_ref, status, created_at                                                                                                                                                                                  | Status mengikuti siklus per channel                                                                |
| **marketplace_order_item**          | id, order_id, sku (produk atau bundle), qty, qty_cancelled, **recipe_version_id** (jika bundle)                                                                                                                                | **[v2]** menyimpan versi resep yang dipakai + dukungan pembatalan parsial                          |
| **return_case**                     | id, order_id, order_item_id (untuk retur parsial), status (`pending_inspection`/`decided`), condition (`resellable`/`damaged`/`lost_in_transit`, nullable sampai diputuskan), reported_at, decided_at, decided_by              | `reported_at` = acuan tenggat klaim TikTok 40 hari                                                 |
| **return_claim_loss_record**        | id, return_case_id, type (`damaged`/`lost_in_transit`), claim_status, notes                                                                                                                                                    | **[v2 baru]** — bukan entri ledger; murni untuk audit & proses klaim                               |
| **reconciliation_session** (opname) | id, opened_at, opened_by, closed_at, closed_by, status                                                                                                                                                                         | Menaungi banyak `opname_count_line`                                                                |
| **opname_count_line**               | id, session_id, product_id, batch_id (nullable jika hitung per produk), counted_qty, recorded_qty_snapshot, diff_qty                                                                                                           | `diff_qty` = recorded − counted                                                                    |
| **daily_check_flag**                | id, date, product_id, batch_id (nullable), flag_type, details                                                                                                                                                                  | Hasil rekonsiliasi harian                                                                          |
| **app_user**                        | id, email, role (`admin` — **[v2] hanya satu nilai**), display_name                                                                                                                                                            | Terhubung ke Supabase Auth                                                                         |
| **event_log**                       | id, event_type, idempotency_key (unique), payload, processed_at                                                                                                                                                                | **[v2 baru]** — jejak event masuk ke Event Interface, dasar pengecekan idempotency (FR-207/FR-410) |

**Prinsip desain data yang mengikat seluruh entitas di atas**: `stock_ledger` adalah satu-satunya tabel yang boleh mengubah persepsi saldo stok, dan **immutable di level database [v2]**. `stock_balance_summary` adalah cache yang **selalu dapat direkonsiliasi ulang** dari `stock_ledger` — bukan sumber kebenaran independen. Tabel lain (`marketplace_order`, `return_case`, `reconciliation_session`) adalah konteks pemicu yang masing-masing menghasilkan baris `stock_ledger` (kecuali retur rusak/hilang, yang justru **sengaja tidak** menghasilkan baris ledger — lihat FR-504/FR-505).

---

## 5. Kebutuhan Antarmuka Eksternal

### 5.1 Antarmuka Pengguna

- Aplikasi web responsif, dioptimalkan untuk operator gudang (form ringkas, bahasa Indonesia).
- **[v2]** Layar konfirmasi/preview (FR-305) sebagai satu-satunya titik friksi yang disengaja — tidak diulang di form lain.
- Lihat **DESIGN.md** untuk pemetaan ke komponen/halaman template yang sudah tersedia.

### 5.2 Antarmuka Data (Impor)

- Impor file CSV/XLSX untuk data pesanan/retur (FR-409), dengan validasi baris dan laporan baris gagal, menghasilkan event ber-`idempotency_key` sesuai FR-410.

### 5.3 Kesiapan Integrasi Masa Depan — **[v2 diperkuat]**

- Titik ekstensi resmi untuk webhook Shopee/TikTok asli adalah **Event Interface** (§2.2): implementasi webhook baru cukup menulis event dengan kontrak yang sama (`OrderCreated`, `OrderStatusChanged`, `OrderCancelled`, `ReturnSubmitted`) plus `idempotency_key` sesuai skema masing-masing marketplace. Stock Engine, ledger, FEFO, dan bundle-splitter **tidak berubah** saat transisi ini dilakukan.

---

## 6. Kebutuhan Non-Fungsional

| Kategori                                         | Kebutuhan                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[v2] Kualitas Rilis**                          | Fully working, zero-bug: tidak ada placeholder/TODO/tombol mati/alur setengah jadi pada deliverable final.                                                                                                                                                                                  |
| **Akurasi & Integritas Data**                    | Saldo stok harus selalu bisa direkonstruksi ulang dari agregasi ledger; tidak ada jalur kode yang menulis saldo secara langsung.                                                                                                                                                            |
| **[v2] Immutability**                            | Dikunci di level database (`REVOKE UPDATE, DELETE` pada `stock_ledger`; trigger penjaga bila diperlukan); penulisan hanya via RPC/Server Action.                                                                                                                                            |
| **[v2] Idempotency**                             | Setiap event eksternal (order/retur) dan setiap insert ledger yang berasal darinya wajib idempotent terhadap retry, via `idempotency_key`.                                                                                                                                                  |
| **Ketertelusuran (Auditability)**                | Setiap entri ledger & claim/loss record menyimpan pelaku dan sumber referensi; tidak ada penghapusan/edit entri lama.                                                                                                                                                                       |
| **Usability**                                    | Alur transaksi harian diselesaikan operator non-teknis tanpa pelatihan formal; istilah bahasa Indonesia yang lazim dipakai gudang; friksi hanya di layar konfirmasi commit.                                                                                                                 |
| **[v2] Performa**                                | Pembacaan saldo untuk dashboard idealnya **O(1)** via `stock_balance_summary`, **bukan** `SUM` full-scan pada `stock_ledger` di setiap query (ledger dapat tumbuh jutaan baris). Mekanisme pemeliharaan cache bebas dipilih tim, asalkan saldo selalu dapat diverifikasi ulang dari ledger. |
| **Keamanan**                                     | Autentikasi via Supabase Auth; RLS memastikan hanya pengguna terautentikasi yang mengakses data (§3.7, FR-704).                                                                                                                                                                             |
| **Portabilitas Arsitektur**                      | Adapter sumber event (simulasi/impor/API asli) terpisah dari Stock Engine via Event Interface (FR-408).                                                                                                                                                                                     |
| **Deployability**                                | Aplikasi harus live/deployed dan dapat langsung dicoba.                                                                                                                                                                                                                                     |
| **Konsistensi Domain**                           | Tidak ada representasi nilai uang/harga di manapun dalam sistem.                                                                                                                                                                                                                            |
| **[v2] Skalabilitas Skema (bukan implementasi)** | Skema boleh dirancang terbuka untuk multi-gudang, reason/channel sebagai tabel referensi, dan role tambahan di masa depan — tanpa membangun fitur tersebut sekarang.                                                                                                                        |

---

## 7. Batasan Cakupan & Default Fase 2 — **[v2, eksplisit dari Sync Update]**

| Area                        | Keputusan                                                                       |
| --------------------------- | ------------------------------------------------------------------------------- |
| Notifikasi                  | In-app saja; email/WhatsApp belum diperlukan                                    |
| Reason code                 | Enum tetap di kode; belum admin-editable                                        |
| Gudang                      | 1 gudang; skema boleh terbuka untuk multi-gudang nanti, tidak dibangun sekarang |
| Barcode & label             | Di luar scope (scanner & cetak label batch)                                     |
| Export CSV worklist/laporan | Boleh dibuat, _nice-to-have_, bukan penentu nilai                               |
| Role pengguna               | 1 role: Admin; tidak ada approval berjenjang                                    |

Penilaian tetap mengikuti brief awal: **kebenaran logika stok & keterlacakan selisih di atas segalanya**, disusul kemudahan pakai operator gudang — bukan kelengkapan fitur semata.

---

## Lampiran A — Ringkasan Peta Fitur Klien (Sumber: Mind Map, disesuaikan v2)

```
Stok Akurat
├─ FASE 1
│  ├─ Dashboard Stok — Ringkasan Stok Per Produk, Pencarian & Filter, Monitor Selisih Harian
│  ├─ Catat Pergerakan Stok — Form Input Cepat, Riwayat Jurnal, Koreksi Entri [v2], Layar Konfirmasi [v2]
│  └─ Adapter Import/Simulasi Pesanan — Buat & Proses Pesanan, Batalkan (penuh/parsial), Proses Retur Manual
├─ FASE 2
│  ├─ Manajemen Data Produk & Bundle — Daftar Produk & Batch, Resep Bundle (versioned) [v2]
│  │  (Atur Channel & Alasan DIHAPUS dari scope v2 — jadi enum tetap)
│  └─ Rekonsiliasi Otomatis — Cek Konsistensi Harian, Sesi Stok Opname, Laporan Selisih,
│                              Worklist Klaim Retur & Reminder 40 Hari TikTok
└─ FASE 3
   └─ Autentikasi — Masuk Akun (1 role: Admin, tanpa Kelola Pengguna & Peran berjenjang) [v2]
```

## Lampiran B — Pemetaan Data Mentah Klien ke Skema

Sumber: tangkapan layar spreadsheet klien (Juni 2026): `NO | NAMA PRODUK | SISA STOK | [per tanggal: RETUR | SHOPEE | MANUAL | TIKTOK]`.

**[v2] Catatan penting**: Sync Update poin 6 menegaskan data ini **hanya contoh untuk testing/demo**, bukan skema wajib. Pemetaan berikut bersifat indikatif untuk migrasi data historis, bukan cerminan skema final.

| Kolom Asal                       | Pemetaan ke Sistem                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NAMA PRODUK`                    | `product.name` (+ `sku` unik ditambahkan saat migrasi)                                                                                                                                                                                                                                                                                            |
| `SISA STOK`                      | Satu entri `stock_ledger` dengan `source_type = initial_balance`, `is_unverified = true` per produk — **[v2]** bukan angka yang terus di-update manual, dan baru terverifikasi setelah opname pertama (FR-603).                                                                                                                                   |
| `RETUR` (per tanggal)            | Data historis → `return_case` + (bila kondisi diketahui) `return_claim_loss_record` atau `stock_ledger` `return_resellable` ke batch `origin = retur`, sesuai FR-503–FR-505. Data berjalan → dihasilkan otomatis oleh alur retur (§3.5), bukan input manual di kolom terpisah.                                                                    |
| `SHOPEE`, `TIKTOK` (per tanggal) | `marketplace_order` + `marketplace_order_item` per channel; data historis dapat diimpor sebagai entri `stock_ledger` `order_fulfillment` langsung via jalur impor (FR-409), masing-masing dengan `idempotency_key` unik per baris impor.                                                                                                          |
| `MANUAL` (per tanggal)           | Entri `stock_ledger` `manual_out` dengan `channel = offline` atau `internal`; sistem baru mewajibkan **reason** eksplisit — data historis tanpa rincian alasan diimpor dengan reason default yang secara eksplisit ditandai "tidak terklasifikasi", agar tetap tertelusur bahwa detailnya hilang di sumber lama, bukan disamarkan seolah lengkap. |

Pemetaan ini menegaskan mengapa desain berbasis ledger + reason wajib + reference_note (FR-302b) diperlukan: struktur lama klien sudah memisahkan retur dan kanal, tapi tidak punya kolom **alasan**, **referensi**, dan **batch/kedaluwarsa** — hal-hal yang justru menjadi sumber kebocoran terbesar (bonus/promo/sampel "tidak terlihat sebagai apa-apa") dan sumber kebocoran ke-5 (salah input admin) yang baru diidentifikasi di Sync Update Phase 2.
