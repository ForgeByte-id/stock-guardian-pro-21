# Product Requirements Document (PRD)

## Stok Akurat — Sistem Rekonsiliasi Stok

|             |                                                |
| ----------- | ---------------------------------------------- |
| **Dokumen** | PRD                                            |
| **Produk**  | Stok Akurat                                    |
| **Terkait** | BRD v2.0, Sync Update Phase 2 v2 (13 Jun 2026) |
| **Versi**   | 2.0 — supersedes v1.0                          |

> **[v2]** menandai bagian yang berubah/baru dari Sync Update Phase 2.

---

## 1. Visi Produk

> Setiap unit barang yang bergerak di gudang meninggalkan jejak. Saat angka stok di catatan berbeda dengan fisik, sistem tidak cuma memberi tahu _berapa_ selisihnya — tapi menunjukkan _dari mana_ selisih itu terbentuk.

Stok Akurat adalah sistem pencatatan berbasis **buku besar pergerakan (ledger) append-only**: tidak ada angka stok yang boleh berubah tanpa ada baris pergerakan yang menjelaskannya. **[v2]** Standar rilis: _fully working, zero-bug_ — tidak ada placeholder, tombol mati, atau alur setengah jadi.

## 2. Masalah yang Diselesaikan

| Sumber Kebocoran                       | Bagaimana Produk Ini Menjawabnya                                                                                                                                                                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pesanan batal, stok tidak dikembalikan | Pembatalan (penuh/parsial) wajib menghasilkan entri ledger pemulihan otomatis jika sudah lolos titik potong SHIPPED/IN_TRANSIT                                                                                                                                                                       |
| Retur dengan nasib berbeda             | **[v2]** Retur "menunggu inspeksi" sampai gudang menetapkan kondisi. **Layak jual** → ledger masuk ke batch baru bertanda "retur". **Rusak/Hilang** → tidak ada movement ledger kedua (stok sudah terpotong saat shipped); dicatat sebagai _claim/loss record_ terpisah untuk audit dan proses klaim |
| Bonus/promo/sampel tak tercatat        | Form "Catat Pergerakan Keluar Manual" mewajibkan alasan **dan referensi ringan** (nama campaign/approval) **[v2]**, sehingga barang gratis tetap tercatat dan bisa dijelaskan ke siapa & kenapa                                                                                                      |
| Stok awal masih perkiraan              | Dicatat sebagai entri _opening balance_ bertanda **"belum terverifikasi"** sampai opname pertama **[v2]**                                                                                                                                                                                            |
| **[v2 baru]** Salah input admin        | Fitur **Koreksi Entri** — reversal cepat, berjejak, terpisah dari Penyesuaian Opname                                                                                                                                                                                                                 |

## 3. Persona Pengguna

**[v2]** Sync Update menetapkan **1 role sistem: Admin**. Tabel berikut menjelaskan **persona pemakai** (siapa yang duduk di depan layar dan apa kebutuhannya), bukan peran akses terpisah — semua login dengan akun Admin yang sama.

| Persona             | Kebutuhan Utama                                                                                    | Tingkat Literasi Teknis          |
| ------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Operator Gudang** | Input cepat pergerakan barang, lihat sisa stok per produk, jalankan sesi opname, klasifikasi retur | Rendah–menengah, prioritas UX #1 |
| **Admin/Owner**     | Kelola produk, batch, resep bundle, lihat rekonsiliasi, koreksi entri                              | Menengah                         |
| **Tim Klaim/CS**    | Pantau retur & tenggat klaim TikTok 40 hari (dihitung sejak retur diajukan)                        | Rendah–menengah                  |
| **Manajemen**       | Lihat dashboard ringkas: sisa stok, kejanggalan, hasil opname terakhir                             | Rendah                           |

## 4. Struktur Fitur per Fase

### FASE 1

#### 4.1 Dashboard Stok

- Ringkasan Stok Per Produk
- Pencarian & Filter
- Monitor Selisih Harian

**Kriteria penerimaan**

- Daftar produk menampilkan sisa stok yang dibaca dari **tabel ringkasan/cache** yang dijaga transaksional dari ledger — bukan `SUM` _full-scan_ setiap kali dashboard dibuka **[v2]** — namun angka ini harus selalu bisa diverifikasi ulang dengan agregasi ledger.
- Pencarian by nama produk & filter by kategori/status kejanggalan.
- Produk dengan kejanggalan hasil rekonsiliasi harian tersorot berbeda dari produk normal.

#### 4.2 Catat Pergerakan Stok

- Form Input Cepat
- Riwayat Jurnal Stok
- **[v2 baru]** Koreksi Entri
- **[v2 baru]** Layar Konfirmasi Sebelum Commit

**Kriteria penerimaan**

- Form input memisahkan **alasan** (reason: `offline / bonus / promo / sample / damaged / expired`) dari **kanal** (channel: `shopee / tiktok / offline / internal`) sebagai dua kolom terpisah dan **enum tetap** (belum admin-editable di fase ini).
- **[v2]** Reason `bonus` / `promo` / `sample` mewajibkan field referensi ringan (nama campaign atau catatan approval) sebelum entri bisa disimpan.
- **[v2]** Setiap penulisan manual permanen (stock-out, koreksi) melewati **satu layar preview** yang menampilkan produk, qty, reason, channel, dan dampaknya ke available stock, sebelum tombol final ditekan. Ini satu-satunya titik yang sengaja diberi friksi — bukan diulang di setiap langkah lain.
- **[v2 baru]** Tersedia aksi "Koreksi Entri": reversal cepat untuk kesalahan input, tercatat sebagai jenis pergerakan **berbeda** dari "Penyesuaian Opname" (`source_type` berbeda), tetap berupa entri ledger baru — bukan edit/hapus entri lama.
- Setiap entri tersimpan sebagai baris baru di ledger (append-only); tidak ada operasi update/delete di level aplikasi maupun database (hak `UPDATE`/`DELETE` dicabut di level DB).
- Riwayat jurnal bisa difilter per produk, per jenis pergerakan, per rentang tanggal, termasuk memfilter khusus entri Koreksi.
- Barang masuk dari maklon wajib menyertakan/menciptakan batch baru dengan tanggal kedaluwarsa.
- Stok awal (opening balance) diinput dengan status **"belum terverifikasi"**, dan baru dianggap terverifikasi setelah sesi opname pertama menyentuh produk tersebut.

#### 4.3 Lapisan Import / Simulasi Pesanan Marketplace

- Buat & Proses Pesanan (termasuk parsial)
- Batalkan Pesanan (penuh & parsial)
- Proses Retur Manual (penuh & parsial, termasuk retur bundle per unit)

**[v2] Perubahan kerangka penting**: fitur ini bukan sekadar "tombol demo", melainkan **satu adapter di belakang interface event** yang kontraknya identik dengan webhook Shopee/TikTok asli. Logika inti (ledger, FEFO, order state machine) membaca dari interface event tersebut — bukan dipanggil langsung dari kode tombol UI. Mengganti adapter import dengan integrasi webhook asli nanti seharusnya **tidak menyentuh logika inti sama sekali**.

**Kriteria penerimaan**

- Membuat pesanan baru = reservasi, tidak menyentuh ledger.
- Stok berkurang saat status naik ke `SHIPPED` (Shopee) atau `IN_TRANSIT` (TikTok), teralokasi otomatis via FEFO.
- Pembatalan **sebelum** titik potong → lepas reservasi, tanpa ledger. Pembatalan **sesudah** titik potong → ledger reversal otomatis.
- **[v2]** Pembatalan & retur **parsial per item** didukung; retur bundle sebagian dihitung per produk satuan, bukan seluruh bundle sekaligus.
- Retur dari simulasi/import masuk status "menunggu inspeksi", tidak otomatis mengubah stok.
- **[v2]** Setiap event dari adapter import/simulasi membawa **idempotency key**, sehingga event yang sama yang terkirim berulang (retry) tidak diproses dua kali.
- Tersedia jalur impor file (CSV/XLSX) yang menghasilkan event dengan kontrak yang sama dengan panel simulasi.

---

### FASE 2

#### 4.4 Manajemen Data Produk & Bundle

- Daftar Produk & Batch
- Resep Bundle (dengan versioning)
- ~~Atur Channel & Alasan~~ **[v2: dihapus dari scope Fase 2]** — reason/channel adalah enum tetap di kode, belum jadi data yang dikelola admin

**Kriteria penerimaan**

- Satu produk bisa memiliki banyak batch aktif sekaligus, masing-masing dengan expiry date dan sisa kuantitas sendiri (dibaca dari ringkasan ledger).
- **[v2]** Resep bundle memiliki **versi**; setiap order menyimpan referensi ke versi resep yang berlaku saat order dibuat, sehingga mengedit resep **tidak mengubah** perhitungan order-order lama.
- Pesanan bundle yang masuk sebelum resepnya terdaftar ditandai untuk penanganan manual, bukan diproses diam-diam.
- Notifikasi barang mendekati kedaluwarsa dikirim **in-app** per batch **[v2: email/WA di luar scope Fase 2]**, berdasarkan ambang hari yang bisa dikonfigurasi.

#### 4.5 Rekonsiliasi Otomatis

- Cek Konsistensi Harian
- Sesi Stok Opname
- Laporan Selisih & Rekomendasi
- Pengingat Tenggat Klaim Retur TikTok (40 hari)

**Kriteria penerimaan**

- Rekonsiliasi harian: proses (terjadwal/dipicu manual) yang membandingkan saldo ringkasan dengan agregasi ledger, menandai anomali (saldo negatif, retur "menunggu inspeksi" > X hari, event tanpa entri ledger padahal sudah lolos titik potong).
- Sesi opname: input hitung fisik per produk/batch → sistem hitung selisih = tercatat − fisik → sesi disahkan → entri **Penyesuaian Opname** baru dibuat (berbeda `source_type` dari Koreksi Entri manual), histori lama tetap utuh.
- Laporan selisih bisa di-drill down ke seluruh entri ledger yang relevan sejak opname/pengecekan sebelumnya.
- **[v2]** Pengingat klaim TikTok 40 hari dihitung sejak **`created_at` retur diajukan** — bukan sejak `IN_TRANSIT` atau diterima pembeli.
- **[v2]** Retur berstatus **rusak** dan **hilang** ditampilkan di worklist klaim dengan status terpisah (proses klaimnya berbeda), tanpa memengaruhi angka stok yang bisa dijual.

---

### FASE 3

#### 4.6 Autentikasi & Akses — **[v2: disederhanakan]**

- Masuk Akun (login)

**[v2]** Versi 1.0 mengasumsikan dua peran (Admin & Operator Gudang) dengan hak berbeda. Sync Update mengoreksi ini: **1 role saja, Admin**, tanpa sub-role, tanpa alur approval berjenjang untuk koreksi.

**Kriteria penerimaan**

- Login via Supabase Auth (email + password).
- Semua tindakan yang mengubah stok tetap mencatat ID pengguna pelaku di ledger (audit trail tetap ada meskipun role tunggal).
- Row Level Security tetap diterapkan agar hanya pengguna terautentikasi yang bisa membaca/menulis data — bukan untuk membedakan tingkat akses antar role.

---

## 5. Alur Kunci (Key Flows)

### 5.1 Siklus Hidup Pesanan → Pengurangan Stok

```
Pesanan dibuat (reservasi, ledger belum tersentuh)
  → Shopee: status SHIPPED  |  TikTok: status IN_TRANSIT
      → ledger keluar dibuat, dialokasikan otomatis via FEFO ke batch
  → Batal setelah titik ini → ledger reversal otomatis (penuh atau parsial per item)
  → Batal sebelum titik ini → tidak ada perubahan ledger (hanya lepas reservasi)
```

### 5.2 Retur — **[v2: alur direvisi]**

```
Retur diajukan (created_at = acuan tenggat klaim TikTok 40 hari)
  → status "menunggu inspeksi" (ledger belum tersentuh)
  → Gudang menginspeksi fisik, menetapkan kondisi:
      - Layak jual → ledger MASUK baru, dialokasikan ke BATCH BARU bertanda "retur"
                     (bukan batch asal — expiry batch asal sering tak bisa dipastikan)
      - Rusak      → TIDAK ada ledger movement kedua (stok sudah terpotong saat shipped/in-transit);
                     dicatat sebagai claim/loss record terpisah untuk audit
      - Hilang     → sama seperti Rusak (tanpa ledger kedua), status klaim terpisah
                     karena proses klaim ekspedisinya berbeda dari Rusak
  → Retur bundle sebagian dihitung per produk satuan komponen, bukan seluruh bundle
```

### 5.3 Barang Keluar Non-Penjualan

```
Operator pilih "Catat Pergerakan Keluar Manual"
  → Pilih alasan (bonus / promo / sample / offline / damaged / expired)
  → Jika bonus/promo/sample → wajib isi referensi ringan (campaign/approval)
  → Pilih channel (offline / internal) — terpisah dari alasan
  → Alokasi batch otomatis via FEFO
  → Layar konfirmasi: tampilkan produk, qty, reason, channel, dampak ke available stock
  → Commit → entri ledger tercatat
```

### 5.4 Bundle (dengan versioning)

```
Pesanan berisi SKU bundle masuk
  → Sistem cari resep bundle terdaftar (versi yang aktif saat ini)
      - Ada resep → pecah ke produk satuan, catat versi resep yang dipakai di order,
                     alokasi FEFO per komponen
      - Tidak ada resep → ditandai untuk penanganan manual, tidak diproses otomatis
  → Resep diedit di kemudian hari TIDAK mengubah order yang sudah menyimpan versi lama
```

### 5.5 Stok Opname vs Koreksi Entri — **[v2: dua jalur berbeda]**

```
Koreksi Entri (kapan saja, saat sadar salah input satu entri)
  → Pilih entri yang salah → buat entri pembalik (reversal) → layar konfirmasi → commit
  → source_type = "manual_correction", terpisah dari opname

Sesi Stok Opname (berkala, 1-3 bulan)
  → Buka sesi → input hitung fisik per produk/batch
  → Sistem hitung selisih vs saldo tercatat saat sesi dibuka
  → Tampilkan pergerakan sejak opname sebelumnya sebagai konteks
  → Sahkan sesi → entri "opname_correction" dibuat, bertaut ke sesi
  → Produk yang opening balance-nya "belum terverifikasi" → status jadi terverifikasi
```

## 6. Non-Goals — **[v2 diperluas]**

- Tidak ada pencatatan nilai uang/harga barang dalam bentuk apa pun.
- Tidak ada integrasi API resmi ke marketplace pada fase ini (arsitektur siap-API, implementasi belum).
- Tidak menangani proses pengiriman/logistik ekspedisi di luar status yang relevan terhadap stok.
- Bukan sistem akuntansi/keuangan.
- **[v2]** Bukan sistem multi-gudang (skema boleh terbuka untuk ini, tidak dibangun sekarang).
- **[v2]** Tidak ada barcode scanner atau cetak label batch.
- **[v2]** Tidak ada notifikasi email/WhatsApp (in-app only untuk Fase 2).
- **[v2]** Reason & channel belum admin-editable (enum tetap di kode).
- **[v2]** Tidak ada sub-role Operator Gudang terpisah atau alur approval berjenjang.

## 7. Metrik Keberhasilan Produk

| Metrik                       | Target Kualitatif                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| Ketertelusuran selisih       | Setiap selisih hasil opname bisa dijelaskan lewat drill-down ke pergerakan ledger                      |
| Kepatuhan alasan pergerakan  | Tidak ada barang keluar tanpa alasan **dan referensi** tercatat untuk bonus/promo/sampel               |
| Anti double-count retur      | Retur rusak/hilang tidak pernah menghasilkan ledger movement kedua                                     |
| Kesiapan transisi API        | Mengganti adapter import dengan webhook asli tidak mengubah logika stok inti sama sekali               |
| Kemudahan pakai gudang       | Transaksi harian diselesaikan operator tanpa pelatihan teknis; friksi hanya di layar konfirmasi commit |
| **[v2]** Kualitas rilis      | Fully working, zero-bug — tidak ada placeholder/TODO/tombol mati di build final                        |
| **[v2]** Performa baca saldo | Dashboard membaca saldo dari ringkasan (O(1)), tetap dapat diverifikasi ulang dari ledger              |

## 8. Rencana Rilis

| Fase   | Cakupan                                                                                                                       | Fokus Validasi                                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Fase 1 | Dashboard Stok, Catat Pergerakan Stok, Lapisan Import/Simulasi Pesanan                                                        | Ledger inti benar; siklus pesanan → SHIPPED/IN_TRANSIT → stok berkurang; pembatalan (penuh/parsial) memulihkan stok      |
| Fase 2 | Manajemen Data Produk & Bundle (versioning), Rekonsiliasi Otomatis, Koreksi Entri, Layar Konfirmasi, kesiapan kontrak webhook | FEFO, bundle versioning, retur layak-jual/rusak/hilang (anti double-count), konsistensi harian, sesi opname, idempotency |
| Fase 3 | Autentikasi (1 role Admin)                                                                                                    | Login, audit trail pelaku, RLS akses data                                                                                |
