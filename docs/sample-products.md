# Sampel Data Produk — Stok Akurat

Sumber: tangkapan layar spreadsheet klien, periode **Juni 2026**.
Kolom asal: `NO | NAMA PRODUK | SISA STOK`.

> **Catatan (mengacu SRS §1.4 & Lampiran B):** data ini contoh untuk seeding/testing, **bukan skema wajib**. Kolom `SISA STOK` dipetakan menjadi satu entri `stock_ledger` per produk dengan `source_type = initial_balance` dan `is_unverified = true` — baru terverifikasi setelah sesi opname pertama menyentuh produk tersebut (SRS FR-306, FR-603). `sku` di bawah dibuat baru saat migrasi karena sumber asli belum punya kode SKU.

## Master Produk & Opening Balance

| No  | SKU (usulan) | Nama Produk                       | Sisa Stok (Opening Balance) | Status                               |
| --- | ------------ | --------------------------------- | --------------------------: | ------------------------------------ |
| 1   | SKU-001      | AURA HYDROGEL MASK                |                      41,044 | Aktif                                |
| 2   | SKU-002      | AURA BLOOM MASK                   |                      25,260 | Aktif                                |
| 3   | SKU-003      | AMPOULE TETONG                    |                           0 | **Nonaktif** (stok kosong di sumber) |
| 4   | SKU-004      | AMAZING JELLY BOOSTER             |                       3,663 | Aktif                                |
| 5   | SKU-005      | BODY MASK PINK                    |                      28,634 | Aktif                                |
| 6   | SKU-006      | BODY LOTION PINK                  |                      15,405 | Aktif                                |
| 7   | SKU-007      | BOOST-8                           |                          64 | Aktif                                |
| 8   | SKU-008      | BOUTSKIN                          |                       1,552 | Aktif                                |
| 9   | SKU-009      | BEAUTE MILK                       |                       3,672 | Aktif                                |
| 10  | SKU-010      | BRIGHTENING BOOSTER               |                         293 | Aktif                                |
| 11  | SKU-011      | BRIGHTENING MOISTURIZING          |                       1,071 | Aktif                                |
| 12  | SKU-012      | COFFEE (L) NEW                    |                       2,971 | Aktif                                |
| 13  | SKU-013      | COCOA CHOCOLATE                   |                       3,201 | Aktif                                |
| 14  | SKU-014      | COLLAGEN WRINKLE                  |                         115 | Aktif                                |
| 15  | SKU-015      | CUSHION                           |                           5 | Aktif                                |
| 16  | SKU-016      | DNA SALMON                        |                      27,792 | Aktif                                |
| 17  | SKU-017      | DAILY BREAST                      |                       3,574 | Aktif                                |
| 18  | SKU-018      | ENERGIZING                        |                      19,095 | Aktif                                |
| 19  | SKU-019      | EXFOLIATING OVERNIGHT             |                      15,744 | Aktif                                |
| 20  | SKU-020      | F-MAX                             |                         153 | Aktif                                |
| 21  | SKU-021      | FACE MIST                         |                       4,874 | Aktif                                |
| 22  | SKU-022      | FACIAL WASH                       |                       2,870 | Aktif                                |
| 23  | SKU-023      | FEMININE WASH                     |                       9,124 | Aktif                                |
| 24  | SKU-024      | GO FLIM NEW                       |                       1,749 | Aktif                                |
| 25  | SKU-025      | GLICOLUXE                         |                      23,420 | Aktif                                |
| 26  | SKU-026      | GLOWHITE GUMMY                    |                         687 | Aktif                                |
| 27  | SKU-027      | GLOW FACE CREAM                   |                       9,036 | Aktif                                |
| 28  | SKU-028      | INTIMELOGY                        |                       3,688 | Aktif                                |
| 29  | SKU-029      | KORSET                            |                         103 | Aktif                                |
| 30  | SKU-030      | LAXLOSS NEW                       |                      22,918 | Aktif                                |
| 31  | SKU-031      | LIP BLUSHING ROSE                 |                       8,161 | Aktif                                |
| 32  | SKU-032      | LIP CHERRY CRUSH                  |                       6,816 | Aktif                                |
| 33  | SKU-033      | LIP TOMATO BLAST                  |                       7,285 | Aktif                                |
| 34  | SKU-034      | LAXMI                             |                       2,038 | Aktif                                |
| 35  | SKU-035      | LIP BERRY FLAME                   |                      16,355 | Aktif                                |
| 36  | SKU-036      | LIP CORAL BLISS                   |                      17,864 | Aktif                                |
| 37  | SKU-037      | LOVE C                            |                       5,126 | Aktif                                |
| 38  | SKU-038      | MASKER MUGWORT HIJAU              |                       5,969 | Aktif                                |
| 39  | SKU-039      | MASKER VOLCANIC ABU               |                       3,115 | Aktif                                |
| 40  | SKU-040      | MAKE UP CREAM                     |                           0 | **Nonaktif** (stok kosong di sumber) |
| 41  | SKU-041      | MOIST CLARIFYING GEL              |                      34,057 | Aktif                                |
| 42  | SKU-042      | NEW BEAUTY PATCH                  |                      14,104 | Aktif                                |
| 43  | SKU-043      | PRIME BLUE COPPER                 |                       5,221 | Aktif                                |
| 44  | SKU-044      | PRIME RED ENERGY                  |                         999 | Aktif                                |
| 45  | SKU-045      | PEACHY                            |                       8,167 | Aktif                                |
| 46  | SKU-046      | PRINCES BOOM                      |                       8,518 | Aktif                                |
| 47  | SKU-047      | PEEL OF MASKER                    |                      60,769 | Aktif                                |
| 48  | SKU-048      | RED SERUM BOOSTING                |                       9,904 | Aktif                                |
| 49  | SKU-049      | SNOWHITE (L) SILVER               |                         230 | Aktif                                |
| 50  | SKU-050      | SNOWHITE (M) SILVER               |                       1,269 | Aktif                                |
| 51  | SKU-051      | SKIN CARE ACNE GREEN              |                       5,445 | Aktif                                |
| 52  | SKU-052      | SABUN DOOSTING BAR                |                      26,899 | Aktif                                |
| 53  | SKU-053      | SABUN ALPHA ARBUTIN               |                      14,529 | Aktif                                |
| 54  | SKU-054      | SERUM MERAH                       |                       1,264 | Aktif                                |
| 55  | SKU-055      | SERUM BIRU                        |                       2,749 | Aktif                                |
| 56  | SKU-056      | SWEET CRUSH PEEL OF LIP           |                       5,332 | Aktif                                |
| 57  | SKU-057      | SUN SCREEN                        |                       5,120 | Aktif                                |
| 58  | SKU-058      | TONE UP CREAM                     |                       5,100 | Aktif                                |
| 59  | SKU-059      | WHITENING SKINCARE SET            |                      10,896 | Aktif                                |
| 60  | SKU-060      | WHITENING SKINCARE SET (BIG SIZE) |                       5,614 | Aktif                                |
| 61  | SKU-061      | WHITETO                           |                       1,643 | Aktif                                |
| 62  | SKU-062      | RED BODY LOTION                   |                         163 | Aktif                                |
| 63  | SKU-063      | DAILY BODY LOTION                 |                         113 | Aktif                                |
| 64  | SKU-064      | RADIANCE DERMA                    |                      10,102 | Aktif                                |
| 65  | SKU-065      | GLASS SKIN PDRN                   |                       1,592 | Aktif                                |

**Total produk**: 65 baris bernama (63 aktif dengan stok > 0, 2 nonaktif/stok kosong: `AMPOULE TETONG`, `MAKE UP CREAM`).

---

## Contoh Pergerakan Harian (untuk uji import, opsional)

Dua baris pertama dari blok tanggal `1-Jun-26` dan `2-Jun-26` di sumber, sebagai contoh kalau butuh data uji untuk adapter import/simulasi (SRS §3.4, FR-409). Kolom `RETUR/SHOPEE/MANUAL/TIKTOK` = jumlah unit keluar per channel pada tanggal tsb; kolom `MANUAL` diimpor dengan reason default **"tidak terklasifikasi"** karena sumber asli tidak merinci alasan (lihat SRS Lampiran B).

| SKU     | Nama Produk           | Tanggal  | Retur | Shopee | Manual | TikTok |
| ------- | --------------------- | -------- | ----: | -----: | -----: | -----: |
| SKU-001 | AURA HYDROGEL MASK    | 2-Jun-26 |     1 |      — |      — |     20 |
| SKU-002 | AURA BLOOM MASK       | 1-Jun-26 |     — |      — |      — |    217 |
| SKU-002 | AURA BLOOM MASK       | 2-Jun-26 |    78 |      — |      — |    740 |
| SKU-004 | AMAZING JELLY BOOSTER | 1-Jun-26 |     — |      — |      9 |    142 |
| SKU-004 | AMAZING JELLY BOOSTER | 2-Jun-26 |    56 |      — |      — |      3 |
| SKU-030 | LAXLOSS NEW           | 1-Jun-26 |     — |      — |      1 |    299 |
| SKU-030 | LAXLOSS NEW           | 2-Jun-26 |   124 |      7 |      — |  5,296 |

> Baris di atas hanya contoh 3–4 produk untuk uji cepat alur import → ledger → dashboard; bukan rekap lengkap seluruh 65 SKU per tanggal.
