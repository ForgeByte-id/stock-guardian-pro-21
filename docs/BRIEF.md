                                                                     VibeDev · Brief Bounty · Sistem Rekonsiliasi Stok




VIBEDEV


Brief Bounty
Sistem Rekonsiliasi Stok untuk Brand Skincare Indonesia
Dokumen ini menjelaskan masalah yang ingin diselesaikan dan arah yang sudah disepakati bersama klien.
Detail teknis selebihnya adalah bagian dari yang kamu tawarkan di aplikasimu.


1. Masalah
Klien kami adalah brand skincare Indonesia dengan sekitar 70 produk (diproduksi secara maklon) yang
berjualan melalui Shopee dan TikTok Shop, dengan ratusan paket keluar setiap hari dan jumlah retur
yang signifikan.
Pencatatan stok mereka saat ini manual berbasis spreadsheet — dan jumlah stok di catatan hampir tidak
pernah cocok dengan barang fisik di gudang. Yang lebih parah: tidak ada yang bisa menjawab selisihnya
bocor di mana. Dari diskusi kami dengan klien, kebocoran datang dari titik-titik seperti ini:
  • Pesanan batal — barang sudah tercatat keluar, pesanannya batal, tapi stok tidak pernah
    dikembalikan di catatan.
  • Retur dengan berbagai nasib — ada yang kembali layak jual, ada yang kembali rusak, ada yang hilang
    di ekspedisi dan tidak pernah kembali.
  • Bonus, promo, dan sampel — barang keluar gudang tanpa terhubung ke pesanan mana pun,
    sehingga tidak terlihat sebagai apa-apa. Ini sumber selisih terbesar.
  • Stok awal yang masih perkiraan — selisih sudah terbentuk bahkan sebelum barang dijual.
Stok opname (hitung fisik) dilakukan setiap 1–3 bulan, dan setiap kali hasilnya sama: ketemu angka
selisih, tanpa cerita di baliknya.


2. Sistem yang Dibangun
Sistem pencatatan & rekonsiliasi stok yang berdiri sendiri, dengan satu tujuan: setiap pergerakan barang
tercatat dan dapat ditelusuri, sehingga selisih stok ditemukan penyebabnya — bukan sekadar diketahui
angkanya.
 Prinsip inti: tidak ada angka stok yang berubah tanpa jejak.

Cakupan fitur:
  • Data produk & batch (termasuk tanggal kedaluwarsa per batch).
  • Buku besar pergerakan stok — pusat dari segalanya; semua fitur lain menulis atau membaca dari
    sini.
  • Pencatatan barang masuk dari maklon.
  • Pencatatan keluar manual: penjualan offline, bonus, promo, sampel, barang rusak, barang
    kedaluwarsa.
  • Penerimaan data pesanan, pembatalan, dan retur dari Shopee dan TikTok Shop.
  • Penanganan retur beserta kondisinya, dan pengingat klaim TikTok sebelum batas 40 hari.
  • Notifikasi barang mendekati kedaluwarsa, per batch.



                                                  Halaman 1
                                                                  VibeDev · Brief Bounty · Sistem Rekonsiliasi Stok




 • Stok opname: input hitung fisik, perbandingan dengan catatan, dan koreksi.
 • Rekonsiliasi: sistem menunjukkan selisih beserta pergerakan pembentuknya — bisa di-drill sampai
   ketahuan sumbernya.
Dua batasan penting:
 • Tanpa integrasi API marketplace — digantikan tombol simulasi. Sediakan tombol untuk
   menyuntikkan data dummy yang mensimulasikan kejadian nyata dari marketplace: pesanan baru,
   pesanan dikirim, pembatalan, retur, dan sebagainya — sehingga seluruh alur sistem bisa didemokan
   hidup-hidup lewat tombol. Rancang bagian ini agar kelak tombol tinggal digantikan API sungguhan
   tanpa mengubah logika inti. Impor file tetap tersedia sebagai jalur masuk data.
 • Tanpa pencatatan harga. Sistem murni menghitung jumlah barang — bukan nilai uang.




                                              Halaman 2
                                                                  VibeDev · Brief Bounty · Sistem Rekonsiliasi Stok




3. Keputusan yang Sudah Disepakati Klien
Arah berikut sudah dibahas dan disepakati bersama klien:
  • Barang dihitung keluar saat fisik meninggalkan gudang — Shopee saat SHIPPED, TikTok saat
    IN_TRANSIT. Sebelum itu, pesanan hanyalah reservasi.
  • Alasan dan kanal adalah dua hal terpisah — penjualan offline dan bonus sama-sama input manual,
    tapi artinya beda: satu penjualan, satu barang gratis. Keduanya tidak boleh tercampur.
  • Alokasi batch otomatis dengan FEFO (First Expired, First Out) — operator tidak pernah memilih
    batch; sistem yang mengalokasikan ke batch dengan kedaluwarsa terdekat.
  • Bundle dihitung satuan — tidak ada stok bundle. Listing paket di marketplace dipecah menjadi
    produk satuan saat data masuk, lewat resep yang didefinisikan admin.
  • Dua ritme rekonsiliasi — harian: sistem memeriksa konsistensi catatannya sendiri dan menandai
    kejanggalan; saat opname: catatan dibandingkan dengan hitung fisik.
  • Kondisi retur diputuskan gudang — layak jual, rusak, atau hilang — secara manual setelah barang
    diinspeksi, bukan otomatis dari marketplace.
Ini arah yang disepakati — bukan harga mati. Kalau kamu punya pendekatan yang menurutmu lebih
baik, usulkan di aplikasimu beserta alasannya.


4. Ketentuan & Penilaian
  • Stack wajib: Next.js + TypeScript + Supabase (Postgres).
  • Submission harus live — produk ter-deploy yang bisa langsung dicoba, bukan mockup atau video.
Urutan penilaian, dari yang paling menentukan:
  • 1. Logika stok benar & selisih bisa ditelusuri — angka yang salah membatalkan segalanya.
  • 2. Kelengkapan fitur sesuai cakupan di Bagian 2.
  • 3. Kemudahan dipakai operator gudang — yang memakai sistem ini bukan developer.
  • 4. Kualitas teknis — kode rapi, deploy stabil.


5. Yang Kami Cari di Aplikasimu
Di aplikasi fase 1, tunjukkan bahwa kamu mengerti kenapa selisih stok terjadi dan bagaimana sistemmu
membuatnya bisa ditelusuri — bukan sekadar sanggup membangun CRUD. Aplikasi yang menonjol adalah
yang membaca masalah di Bagian 1 dengan tajam dan menjelaskan pendekatannya dengan alasan yang
jernih.




                                                 Halaman 3
VIBEDEV                                                                                            PHASE       2       ·    SYNC   UPDATE



                                                                                               SYNC                UPDATE
         vibedev                                                                               Phase       2       ·       brief   bounty




BOUNTY   sistem-rekonsiliasi-stok          CLIENT   brand skincare Indonesia          VERSI   v2           ISSUED            13 Jun 2026




BRIEF    BOUNTY   ·   PHASE   2



Sync Update — Phase 2
Brief Bounty: Sistem Rekonsiliasi Stok · brand skincare Indonesia
versi v2 · 13 juni 2026 · untuk dev terpilih phase 2


Sync update ini untuk menyelaraskan arah sebelum Phase 2 — menggabungkan masukan, jawaban atas pertanyaan
kalian, dan beberapa penyempurnaan dari review aplikasi Phase 1. Buat yang lanjut ke Phase 2, jadikan ini acuan saat
membangun. Kalau ada yang berbeda dari aplikasi awal kalian, ikuti arah di dokumen ini.



STANDAR HASIL AKHIR — BACA DULU



   FULLY WORKING · ZERO-BUG

   Semua fungsi harus benar-benar jalan end-to-end dan terimplementasi penuh — mendekati nol bug. Tidak ada
   placeholder, TODO, tombol mati, atau alur setengah jadi. Setiap movement (masuk / keluar / retur / opname / koreksi)
   harus benar-benar mengubah saldo dengan benar dan dapat ditelusuri. Ingat penilaian brief: satu angka salah = sistem
   dianggap gagal.




   SIAP INTEGRASI API + WEBHOOK ASLI — RE-SETUP MINIMAL

   Idealnya arsitektur hasil akhir sudah siap disambung ke API & webhook Shopee dan TikTok Shop asli dengan penyesuaian
   seminimal mungkin:

   • Lapisan import sebaiknya menulis event dalam bentuk & kontrak yang sama persis dengan webhook asli nanti.

   • Lapisan import diperlakukan sebagai satu adapter di belakang interface event. Logika inti (ledger, FEFO, order state
     machine) membaca dari interface itu — bukan dari tombol.

   • Mengganti lapisan import -> API/webhook asli nanti idealnya tidak menyentuh logika inti sama sekali.

   • Catatan: kalian belum menyambung integrasi API asli sekarang (masih lewat import). Tapi kesiapannya sebaiknya
     sudah nyata di arsitektur, bukan sekadar klaim.




JAWABAN PERTANYAAN PENTING

1. Countdown klaim TikTok (40 hari) dihitung sejak retur diajukan created_at retur — bukan sejak IN_TRANSIT atau diterima
   pembeli.

2. Retur layak jual masuk ke batch baru bertanda "retur" — bukan batch asal. Alasan: expiry batch asal sering tak bisa
   dipastikan; batch baru menjaga akurasi FEFO.

3. Retur rusak / hilang tidak menulis movement stok kedua (stok sudah terpotong saat shipped — hindari double-count). Tetap
   dicatat sebagai record klaim/loss untuk audit. "Hilang" dipisah statusnya dari "rusak" karena proses klaimnya berbeda.




Issued by VibeDev · vibedev.id — internal / confidential                                                                       hal. 1 / 3
VIBEDEV                                                                                             PHASE   2   ·   SYNC   UPDATE




4. Pembatalan & retur parsial per item didukung. Retur bundle sebagian dihitung per produk satuan, bukan seluruh bundle.

5. Stok awal yang masih perkiraan dicatat sebagai entri opening balance bertanda "belum terverifikasi" sampai opname
   pertama.

6. Sample stok record yang dilampirkan = contoh data untuk testing/demo saja. Bukan skema wajib — rancang skema kalian
   sendiri yang benar.



PENAMBAHAN DARI REVIEW APLIKASI

• Sumber selisih ke-5: salah input admin. Karena ledger append-only & opname hanya tiap 1–3 bulan, sediakan "Koreksi Entri"
  (reversal cepat saat operator sadar salah input) yang dibedakan dari "Penyesuaian Opname". Keduanya = entri ledger baru
  berjejak, bukan edit/hapus.

• Layar konfirmasi sebelum commit. Setiap penulisan manual permanen (stock-out, koreksi) melewati satu layar preview yang
  menampilkan produk, qty, reason, channel, dan dampak ke available stock sebelum tombol final. Ini satu-satunya titik yang
  sengaja diberi friksi.

• Bonus/promo/sampel sebaiknya punya referensi. Karena kategori ini = sumber selisih terbesar, entri-nya idealnya mengisi
  referensi ringan (nama campaign / catatan approval), bukan hanya reason. Tujuan: kebocoran terbesar bukan sekadar tercatat,
  tapi bisa dijelaskan ke siapa & kenapa.



ARAH TEKNIS — RECAP

• Stack: Next.js + TypeScript + Supabase (Postgres).

• Stock Ledger append-only = satu-satunya sumber kebenaran. Saldo = hasil agregasi; tidak ada kolom stok yang diedit
  langsung. Immutability dikunci di level DB (cabut UPDATE/DELETE + trigger), tulis lewat RPC / Server Action.

• Performa: baca saldo harus cepat — idealnya O(1) via summary/cache yang di-maintain dari ledger; jangan SUM full-scan tiap
  query (ledger akan tumbuh jutaan baris). Cara bebas, asalkan saldo selalu bisa diverifikasi ulang dari ledger.

• Barang dihitung keluar saat SHIPPED (Shopee) / IN_TRANSIT (TikTok). Sebelum itu = reservasi, belum sentuh ledger. Batal
  sebelum shipped = lepas reservasi; batal sesudah shipped = ledger reversal.

• FEFO otomatis. Operator tidak pernah memilih batch manual.

• Bundle dipecah jadi satuan lewat resep admin sebelum masuk ledger (tidak ada stok bundle). Resep di-versioning — order
  lama tak berubah saat resep diedit.

• Channel dan reason = dua kolom terpisah. reason: offline/bonus/promo/sample/damaged/expired · channel:
  shopee/tiktok/offline/internal.

• Retur: kondisi diputuskan manual oleh gudang (layak jual / rusak / hilang).

• Dua ritme rekonsiliasi: harian (cek konsistensi internal -> worklist anomali) + opname (vs hitung fisik). Koreksi opname = entri
  ledger baru bertaut ke sesi.

• Reminder klaim TikTok 40 hari + notifikasi kedaluwarsa per batch.

• Tanpa harga/uang — murni kuantitas.

• 1 role: Admin. Tidak ada sub-role operator terpisah. Koreksi tidak butuh approval super-admin.

• Aplikasi live/deployed.

• Idempotency + append-only di level DB = penting.




Issued by VibeDev · vibedev.id — internal / confidential                                                               hal. 2 / 3
VIBEDEV                                                                                            PHASE   2   ·   SYNC   UPDATE




SCOPE & DEFAULT

• Notifikasi Phase 2 = in-app only. Belum perlu email/WA.

• Reason code = enum tetap. Belum perlu admin-editable.

• 1 gudang. Skema boleh dibiarkan terbuka untuk multi-warehouse nanti, tapi jangan dibangun sekarang.

• Barcode scanner & cetak label batch = di luar scope.

• Export CSV worklist/laporan = boleh, nice-to-have, bukan penentu nilai.




Penilaian tetap sama seperti brief: kebenaran logika stok & keterlacakan selisih di atas segalanya, disusul kemudahan pakai
untuk operator gudang — bukan kelengkapan fitur semata. Ada yang belum jelas? Tanyakan di channel bounty sebelum
mulai membangun.




Issued by VibeDev · vibedev.id — internal / confidential                                                              hal. 3 / 3
