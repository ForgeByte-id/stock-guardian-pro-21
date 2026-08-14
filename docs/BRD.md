# Business Requirements Document (BRD)

## Sistem Rekonsiliasi Stok — Brand Skincare Indonesia

|             |                                                                |
| ----------- | -------------------------------------------------------------- |
| **Dokumen** | BRD                                                            |
| **Proyek**  | Sistem Pencatatan & Rekonsiliasi Stok (Stok Akurat)            |
| **Klien**   | Brand skincare Indonesia (maklon, ±70 SKU)                     |
| **Sumber**  | Brief Bounty VibeDev v1 + Sync Update Phase 2 v2 (13 Jun 2026) |
| **Versi**   | 2.0 — supersedes v1.0, mengikuti arahan Sync Update Phase 2    |

> **Catatan versi**: Sync Update Phase 2 (v2) secara eksplisit menyatakan _"kalau ada yang berbeda dari aplikasi awal kalian, ikuti arah di dokumen ini."_ BRD ini mengikuti prinsip yang sama — jika ada perbedaan dengan versi 1.0, **v2 yang berlaku**. Bagian yang berubah ditandai **[v2]**.

---

## 1. Ringkasan Eksekutif

Klien adalah brand skincare Indonesia yang memproduksi ±70 produk secara maklon dan menjual melalui **Shopee** dan **TikTok Shop**, dengan ratusan paket keluar per hari dan volume retur yang signifikan. Pencatatan stok saat ini manual di spreadsheet (lihat Lampiran A), dan angka stok di catatan hampir tidak pernah cocok dengan barang fisik di gudang. Masalah intinya bukan sekadar "stok tidak akurat", melainkan **tidak ada yang bisa menjelaskan di titik mana selisih itu terjadi**.

Proyek ini membangun sistem pencatatan & rekonsiliasi stok yang berdiri sendiri, dengan prinsip: **tidak ada angka stok yang berubah tanpa jejak**.

**[v2] Standar hasil akhir yang mengikat seluruh dokumen ini**: _fully working, zero-bug_. Semua fungsi harus benar-benar jalan end-to-end — tidak ada placeholder, TODO, tombol mati, atau alur setengah jadi. Satu angka salah dianggap menggugurkan sistem.

---

## 2. Latar Belakang & Masalah Bisnis

### 2.1 Konteks

- ±70 SKU, produksi maklon (pihak ketiga).
- Kanal jualan: Shopee & TikTok Shop, volume ratusan paket keluar/hari.
- Retur dalam jumlah signifikan.
- Stok opname (hitung fisik) hanya tiap 1–3 bulan.
- Setiap opname selalu menemukan selisih, tanpa penjelasan penyebabnya.

### 2.2 Titik-Titik Kebocoran Stok

| #   | Sumber Kebocoran                    | Penjelasan                                                                                                                                                                        |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Pesanan batal**                   | Barang sudah tercatat keluar, pesanan batal, stok tidak pernah dikembalikan di catatan.                                                                                           |
| 2   | **Retur dengan nasib berbeda-beda** | Ada yang layak jual kembali, ada yang rusak, ada yang hilang di ekspedisi dan tidak pernah kembali.                                                                               |
| 3   | **Bonus, promo, sampel**            | Barang keluar gudang tanpa terhubung ke pesanan apa pun — **sumber selisih terbesar**, karena tidak tercatat sebagai apa-apa.                                                     |
| 4   | **Stok awal berbasis perkiraan**    | Selisih sudah terbentuk bahkan sebelum barang mulai dijual.                                                                                                                       |
| 5   | **[v2] Salah input admin**          | Karena ledger _append-only_ dan opname hanya tiap 1–3 bulan, kesalahan input operator/admin bisa bertahan lama tanpa terdeteksi jika tidak ada jalur koreksi cepat yang berjejak. |

### 2.3 Dampak Bisnis

- Keputusan restock, forecast, dan klaim retur ke marketplace (termasuk batas klaim TikTok 40 hari) tidak bisa diandalkan.
- Waktu operasional habis untuk investigasi manual saat opname, tanpa hasil yang bisa ditindaklanjuti.
- Risiko kerugian senyap dari kebocoran yang berulang tiap siklus tanpa terdeteksi akar masalahnya.

---

## 3. Tujuan Bisnis

| ID   | Tujuan                                                                                                                | Indikator Keberhasilan                                                                                               |
| ---- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| BG-1 | Setiap pergerakan stok tercatat dan tertelusur                                                                        | 100% perubahan stok punya sumber pergerakan yang jelas (tidak ada edit/hapus langsung entri ledger)                  |
| BG-2 | Selisih saat opname bisa dijelaskan penyebabnya                                                                       | Setiap selisih bisa di-_drill down_ ke pergerakan pembentuknya                                                       |
| BG-3 | Kebocoran dari bonus/promo/sampel tercatat & bisa dijelaskan ke siapa/kenapa **[v2]**                                 | Semua barang keluar non-penjualan wajib punya alasan **dan referensi ringan** (nama campaign/approval)               |
| BG-4 | Retur tertangani sesuai kondisi fisik, tanpa duplikasi hitungan stok **[v2]**                                         | Retur diklasifikasi layak jual / rusak / hilang secara manual; hanya layak jual yang menghasilkan movement stok baru |
| BG-5 | Sistem bisa didemokan tanpa integrasi marketplace nyata, dan siap disambung API asli dengan re-setup minimal **[v2]** | Lapisan import menulis event dalam kontrak yang sama persis dengan webhook asli nanti                                |
| BG-6 | Kesalahan input bisa dikoreksi cepat tanpa menunggu opname **[v2 baru]**                                              | Tersedia "Koreksi Entri" (reversal cepat) berjejak, terpisah dari "Penyesuaian Opname"                               |
| BG-7 | Kualitas rilis memenuhi standar _fully working, zero-bug_ **[v2 baru]**                                               | Tidak ada placeholder/TODO/tombol mati/alur setengah jadi di deliverable final                                       |

---

## 4. Ruang Lingkup

### 4.1 Termasuk Ruang Lingkup (In-Scope)

1. Data produk & batch (termasuk tanggal kedaluwarsa per batch).
2. Buku besar pergerakan stok (stock ledger, _append-only_) sebagai pusat data.
3. Pencatatan barang masuk dari maklon.
4. Pencatatan keluar manual: penjualan offline, bonus, promo, sampel, barang rusak, barang kedaluwarsa — **[v2]** entri bonus/promo/sampel wajib menyertakan referensi ringan (nama campaign/catatan approval).
5. Penerimaan data pesanan, pembatalan (penuh & parsial), dan retur (penuh & parsial) dari Shopee & TikTok Shop — via **lapisan import/simulasi**, dirancang dengan kontrak yang identik dengan webhook asli **[v2]**.
6. Penanganan retur beserta kondisinya (layak jual/rusak/hilang) + pengingat klaim TikTok sebelum batas 40 hari, dihitung sejak **retur diajukan [v2]**.
7. Notifikasi barang mendekati kedaluwarsa, per batch — **[v2]** in-app saja untuk fase ini, belum email/WA.
8. Stok opname: input hitung fisik, perbandingan dengan catatan, dan koreksi (Penyesuaian Opname).
9. **[v2 baru]** Koreksi Entri: reversal cepat untuk kesalahan input, terpisah dari Penyesuaian Opname.
10. Rekonsiliasi: penampilan selisih beserta pergerakan pembentuknya, bisa di-_drill down_.
11. Alokasi batch otomatis dengan metode FEFO.
12. Penguraian bundle/paket menjadi produk satuan melalui resep admin, dengan **versioning resep [v2]** — order lama tidak berubah saat resep diedit.
13. **[v2 baru]** Layar konfirmasi/preview sebelum commit setiap penulisan manual permanen (stock-out, koreksi), menampilkan produk, qty, reason, channel, dan dampak ke available stock.
14. Impor file sebagai jalur masuk data, ditulis dalam kontrak event yang sama dengan webhook asli nanti.
15. Autentikasi pengguna (satu peran: Admin — lihat 4.3).

### 4.2 Di Luar Ruang Lingkup (Out-of-Scope) — **[v2 diperjelas]**

- Integrasi API resmi ke Shopee/TikTok Shop (digantikan lapisan import; arsitektur harus siap API dengan re-setup minimal).
- Pencatatan nilai uang/harga barang — sistem murni menghitung **jumlah unit**.
- Modul akuntansi, invoicing, atau pajak.
- Manajemen pengiriman/logistik ekspedisi di luar status yang relevan terhadap stok.
- Notifikasi via email/WhatsApp (Phase 2: in-app only).
- Channel/reason yang dapat diedit admin (Phase 2: enum tetap; lihat SRS §3.1).
- Multi-gudang (skema data boleh dibiarkan terbuka untuk ini, tapi **tidak dibangun** sekarang — 1 gudang).
- Barcode scanner & cetak label batch.
- Sub-role Operator Gudang terpisah dari Admin, dan alur approval untuk koreksi (1 role: Admin, koreksi tidak butuh approval super-admin).

### 4.3 Model Akses — **[v2, revisi dari v1]**

Versi 1.0 mengasumsikan dua peran (Admin & Operator Gudang). **Sync Update Phase 2 mengoreksi ini: hanya 1 role, yaitu Admin.** Tidak ada sub-role operator terpisah, dan tindakan koreksi tidak memerlukan persetujuan berjenjang. Perbedaan "operator gudang" vs "admin/owner" pada dokumen ini selanjutnya adalah perbedaan **persona pemakai** (siapa yang duduk di depan layar), bukan perbedaan **hak akses sistem** — lihat PRD §3 dan §4.6.

### 4.4 Cakupan per Fase (mengacu peta fitur klien)

| Fase       | Modul                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Fase 1** | Dashboard Stok, Catat Pergerakan Stok, Simulasi/Import Pesanan Marketplace                                              |
| **Fase 2** | Manajemen Data Produk & Bundle, Rekonsiliasi Otomatis, Koreksi Entri, Layar Konfirmasi, kesiapan arsitektur API/webhook |
| **Fase 3** | Autentikasi dasar (1 role: Admin)                                                                                       |

---

## 5. Pemangku Kepentingan (Stakeholders)

| Peran                                                            | Kepentingan                                                                                                                                                                |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pemilik/Manajemen Brand**                                      | Kepastian angka stok, transparansi sumber selisih, dasar keputusan restock                                                                                                 |
| **Admin/Owner Sistem**                                           | Mengelola master data produk, batch, resep bundle; satu-satunya role yang login ke sistem                                                                                  |
| **Operator Gudang** (persona pemakai, bukan role akses terpisah) | Pengguna harian utama — input pergerakan barang, opname fisik, klasifikasi retur, lewat akun Admin. **Bukan developer**, sehingga kemudahan pakai adalah prioritas tinggi. |
| **Tim Customer Service/Klaim**                                   | Memantau retur dan batas waktu klaim TikTok (40 hari, dihitung sejak retur diajukan)                                                                                       |
| **Tim Pengembang (VibeDev bounty participant)**                  | Membangun, mendemokan, dan men-deploy sistem sesuai brief + sync update                                                                                                    |

---

## 6. Kebutuhan Bisnis (Business Requirements)

| ID    | Kebutuhan Bisnis                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Status                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| BR-01 | Barang dihitung keluar saat fisik meninggalkan gudang: Shopee saat `SHIPPED`, TikTok saat `IN_TRANSIT`. Sebelum itu, pesanan hanyalah reservasi dan tidak menyentuh ledger. Batal sebelum titik ini = lepas reservasi (tanpa ledger); batal sesudahnya = ledger reversal.                                                                                                                                                                                                             | Tetap dari v1                                                 |
| BR-02 | Alasan (reason) dan kanal (channel) adalah dua kolom terpisah: reason = `offline / bonus / promo / sample / damaged / expired`; channel = `shopee / tiktok / offline / internal`.                                                                                                                                                                                                                                                                                                     | **[v2]** Diperjelas jadi enum tetap                           |
| BR-03 | Alokasi batch untuk setiap pengeluaran barang harus otomatis mengikuti FEFO; operator tidak pernah memilih batch manual.                                                                                                                                                                                                                                                                                                                                                              | Tetap dari v1                                                 |
| BR-04 | Produk bundle harus dipecah menjadi stok produk satuan sesuai resep admin — tidak ada stok bundle. Resep di-**versioning**: order lama tidak berubah saat resep diedit.                                                                                                                                                                                                                                                                                                               | **[v2]** Ditambah versioning                                  |
| BR-05 | Dua ritme rekonsiliasi: **harian** (cek konsistensi internal, worklist anomali) dan **opname** (vs hitung fisik). Koreksi opname = entri ledger baru bertaut ke sesi opname.                                                                                                                                                                                                                                                                                                          | Tetap dari v1                                                 |
| BR-06 | Kondisi retur (layak jual/rusak/hilang) diputuskan manual oleh gudang. **Layak jual** → entri ledger masuk ke **batch baru bertanda "retur"** (bukan batch asal, karena expiry batch asal sering tak bisa dipastikan). **Rusak** dan **Hilang** → **tidak** ada movement ledger kedua (stok sudah terpotong saat shipped/in-transit, menghindari double-count); tetap dicatat sebagai _claim/loss record_ terpisah untuk audit, dengan status berbeda karena proses klaimnya berbeda. | **[v2] Revisi signifikan dari v1**                            |
| BR-07 | Pengingat klaim retur TikTok Shop (40 hari) dihitung sejak **retur diajukan** (`created_at` retur) — bukan sejak `IN_TRANSIT` atau diterima pembeli.                                                                                                                                                                                                                                                                                                                                  | **[v2] Diperjelas**                                           |
| BR-08 | Sistem harus menyediakan lapisan import/simulasi yang mereproduksi kejadian marketplace (pesanan baru, dikirim, batal — penuh/parsial, retur — penuh/parsial), yang menulis event dalam **bentuk & kontrak yang sama persis** dengan webhook asli nanti. Lapisan ini adalah satu adapter di belakang _interface event_; logika inti (ledger, FEFO, order state machine) membaca dari interface itu, bukan dari tombol.                                                                | **[v2] Diperkuat jadi syarat arsitektur, bukan sekadar demo** |
| BR-09 | Impor file tetap tersedia sebagai jalur masuk data, mengikuti kontrak event yang sama.                                                                                                                                                                                                                                                                                                                                                                                                | Tetap dari v1                                                 |
| BR-10 | Sistem tidak mencatat nilai uang/harga dalam bentuk apa pun — hanya jumlah unit.                                                                                                                                                                                                                                                                                                                                                                                                      | Tetap dari v1                                                 |
| BR-11 | Sistem harus menampilkan setiap selisih stok beserta rantai pergerakan yang membentuknya, sehingga bisa ditelusuri sampai sumbernya.                                                                                                                                                                                                                                                                                                                                                  | Tetap dari v1                                                 |
| BR-12 | Setiap entri ledger mencatat pengguna pelaku (audit trail).                                                                                                                                                                                                                                                                                                                                                                                                                           | Tetap, disederhanakan (1 role)                                |
| BR-13 | **[v2 baru]** Sistem harus menyediakan "Koreksi Entri" — reversal cepat saat operator sadar salah input — sebagai jenis pergerakan yang dibedakan secara eksplisit dari "Penyesuaian Opname". Keduanya tetap berupa entri ledger baru berjejak, bukan edit/hapus entri lama.                                                                                                                                                                                                          | Baru                                                          |
| BR-14 | **[v2 baru]** Setiap penulisan manual permanen (stock-out, koreksi) harus melewati satu layar konfirmasi/preview yang menampilkan produk, qty, reason, channel, dan dampak ke available stock sebelum tombol final ditekan. Ini satu-satunya titik yang sengaja diberi friksi.                                                                                                                                                                                                        | Baru                                                          |
| BR-15 | **[v2 baru]** Entri bonus/promo/sampel wajib mengisi referensi ringan (nama campaign / catatan approval), karena kategori ini adalah sumber selisih terbesar dan harus bisa dijelaskan ke siapa & kenapa.                                                                                                                                                                                                                                                                             | Baru                                                          |
| BR-16 | **[v2 baru]** Stok opname mendukung retur parsial per item; retur bundle sebagian dihitung per produk satuan, bukan seluruh bundle.                                                                                                                                                                                                                                                                                                                                                   | Baru                                                          |
| BR-17 | **[v2 baru]** Stok awal yang masih perkiraan dicatat sebagai entri _opening balance_ bertanda **"belum terverifikasi"** sampai opname pertama mengonfirmasinya.                                                                                                                                                                                                                                                                                                                       | Baru                                                          |
| BR-18 | **[v2 baru]** Immutability ledger dikunci di level database (bukan hanya di lapisan aplikasi): hak `UPDATE`/`DELETE` dicabut dari tabel ledger, penulisan hanya lewat RPC/Server Action, dan idempotency dijamin agar event yang sama tidak diproses dua kali.                                                                                                                                                                                                                        | Baru                                                          |
| BR-19 | **[v2 baru]** Pembacaan saldo stok harus cepat: idealnya O(1) via tabel ringkasan/cache yang dijaga transaksional dari ledger, bukan `SUM` _full-scan_ setiap query — namun saldo tetap harus selalu bisa diverifikasi ulang dari ledger.                                                                                                                                                                                                                                             | Baru                                                          |

---

## 7. Asumsi

1. Data marketplace tidak tersedia lewat API resmi pada fase ini; seluruh alur didemokan lewat lapisan import/simulasi yang kontraknya identik dengan webhook asli.
2. Klien menyediakan struktur data awal (nama produk, sisa stok per produk) sebagaimana tercermin pada Lampiran A; struktur ini menjadi acuan minimal kolom master produk, **bukan skema wajib** — tim pengembang merancang skema sendiri yang benar (dikonfirmasi Sync Update poin 6).
3. Operator gudang mengoperasikan sistem dari perangkat dengan akses browser standar, login menggunakan akun Admin bersama; tidak diasumsikan literasi teknis tinggi.
4. "Hilang di ekspedisi" untuk retur adalah status klaim yang dicatat, bukan proses klaim asuransi/logistik itu sendiri yang dijalankan sistem.
5. Stack teknis (Next.js + TypeScript + Supabase/Postgres) sudah ditetapkan, bukan pilihan terbuka.
6. Skema database boleh dirancang terbuka untuk multi-gudang di masa depan, tapi implementasi multi-gudang tidak dibangun pada fase ini.

## 8. Batasan (Constraints)

1. **Stack wajib**: Next.js + TypeScript + Supabase (Postgres).
2. **Submission harus live** — produk ter-deploy yang bisa langsung dicoba, bukan mockup/video.
3. **[v2]** Deliverable harus **fully working, zero-bug** — tidak ada placeholder, TODO, tombol mati, atau alur setengah jadi.
4. Tidak ada integrasi API marketplace resmi pada fase ini (namun arsitektur wajib siap API dengan re-setup minimal).
5. Tidak ada pencatatan nilai uang/harga.
6. **[v2]** 1 role pengguna (Admin); 1 gudang; reason/channel enum tetap (belum admin-editable); notifikasi in-app saja; tanpa barcode scanner/cetak label.
7. Waktu pengembangan terbatas sesuai jadwal bounty.

## 9. Risiko Bisnis

| Risiko                                                                                                                                     | Dampak                                                           | Mitigasi                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logika stok salah pada kasus edge (batal parsial setelah shipped, retur rusak yang keliru menulis movement kedua, bundle bercampur satuan) | Menggugurkan seluruh nilai sistem — kriteria penilaian tertinggi | Ledger sebagai satu-satunya sumber kebenaran, _append-only_ dikunci di level DB; aturan retur rusak/hilang eksplisit **tidak** menulis movement kedua (BR-06) |
| Double-count saat retur rusak/hilang tercatat dua kali (saat shipped & saat retur)                                                         | Stok tampak lebih rendah dari fisik                              | BR-06: hanya retur **layak jual** yang menulis movement baru; rusak/hilang jadi _claim record_ terpisah, bukan ledger                                         |
| Operator gudang kesulitan memakai sistem                                                                                                   | Adopsi rendah, kembali ke spreadsheet                            | Alur input sederhana, layar konfirmasi hanya di titik penulisan permanen (BR-14), bukan di semua langkah                                                      |
| Lapisan import tidak merepresentasikan kontrak webhook asli                                                                                | Transisi ke API nyata butuh re-setup besar, melanggar BG-5       | Import/simulasi ditulis sebagai adapter di belakang interface event yang kontraknya sama persis dengan webhook asli (BR-08)                                   |
| Kesalahan input admin bertahan lama tanpa terdeteksi (opname 1–3 bulan)                                                                    | Selisih menumpuk tanpa penjelasan                                | BR-13: "Koreksi Entri" sebagai reversal cepat, berjejak                                                                                                       |
| Resep bundle diedit dan mengubah histori order lama                                                                                        | Laporan historis jadi tidak akurat                               | BR-04: resep bundle di-versioning, order lama mengunci versi resep saat order dibuat                                                                          |
| Saldo lambat dibaca saat ledger tumbuh jutaan baris                                                                                        | Dashboard tidak responsif                                        | BR-19: tabel ringkasan/cache saldo yang selalu bisa diverifikasi ulang dari ledger                                                                            |

## 10. Kriteria Sukses Proyek

Sesuai urutan penilaian bounty (dari paling menentukan), diperkuat Sync Update Phase 2:

1. **Logika stok benar & selisih bisa ditelusuri** — termasuk kasus retur rusak/hilang yang tidak boleh double-count, dan **standar fully working/zero-bug**.
2. **Kelengkapan fitur** sesuai ruang lingkup Bagian 4.1.
3. **Kemudahan pakai** bagi operator gudang non-teknis.
4. **Kualitas teknis** — kode rapi, immutability dikunci di level DB, idempotency terjaga, deploy stabil.

---

## Lampiran A — Data Acuan dari Klien

- **Peta fitur (mind map)**: struktur modul per fase — Dashboard Stok, Catat Pergerakan Stok, Simulasi Pesanan Marketplace (Fase 1); Manajemen Data Produk & Bundle, Rekonsiliasi Otomatis (Fase 2); Akses & Keamanan (Fase 3, disederhanakan jadi 1 role di v2). Rincian sub-fitur ada di PRD Bagian 4.
- **Contoh data spreadsheet klien** (screenshot Juni 2026): kolom `NO`, `NAMA PRODUK`, `SISA STOK`, lalu blok berulang per tanggal berisi `RETUR`, `SHOPEE`, `MANUAL`, `TIKTOK`. **[v2]** Sync Update poin 6 menegaskan: data contoh ini hanya untuk testing/demo, **bukan skema wajib** — tim merancang skema sendiri (lihat SRS Lampiran B untuk pemetaan indikatif).
