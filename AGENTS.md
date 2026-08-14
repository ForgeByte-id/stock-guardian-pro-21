# AGENTS.md

## Stok Akurat — Panduan Agent Coding

Dokumen ini untuk agent coding (Claude Code atau sejenisnya) yang mengerjakan repo ini. Acuan kebutuhan: `docs/BRIEF.md`, `docs/BRD.md`, `docs/PRD.md`, `docs/SRS.md`, `docs/sample-products.md` (v2.0, mengikuti Sync Update Phase 2). Baca ketiganya sebelum menulis kode, terutama SRS §2–§4.

Atau Paling Tidak baca semua file yang ada di `docs/`.

> **Catatan tentang skill di bawah**: skill `hallmark` dan `supabase` yang direferensikan di sini **tidak tersedia di lingkungan penyusun dokumen ini** saat file ini dibuat — cek dulu apakah keduanya sudah ada di `.claude/skills/` (atau folder skill lain yang dipakai tooling kalian) sebelum agent mencoba memanggilnya. Kalau belum ada, treat instruksi di bawah sebagai _pemetaan kapan skill itu seharusnya dipakai_, bukan jaminan skill sudah terpasang.

---

## 0. Sebelum Mulai — Cek Skill yang Tersedia

Jangan asumsikan skill tersedia. Di awal setiap sesi kerja:

1. List isi `.claude/skills/` (atau direktori skill proyek yang berlaku).
2. Konfirmasi apakah `hallmark` (anti-AI-slop design) dan `supabase` ada.
3. Kalau salah satu tidak ada: kerjakan tugas tanpanya, tapi tandai eksplisit di ringkasan/PR bahwa desain UI atau setup Supabase tidak melalui skill tersebut — jangan diam-diam melewatkannya.
4. Kalau ada skill lain yang relevan (mis. skill Next.js/testing internal repo), scan juga sebelum menulis kode, bukan hanya dua yang disebut di bawah.

---

## 1. Ringkasan Proyek

Sistem pencatatan & rekonsiliasi stok untuk brand skincare (±70 SKU, maklon, jual via Shopee & TikTok Shop). Prinsip inti: **tidak ada angka stok yang berubah tanpa jejak** — semua perubahan saldo wajib lewat `stock_ledger` yang _append-only_ dan immutable di level database.

**Standar rilis (non-negosiabel, dari Sync Update Phase 2): fully working, zero-bug.** Tidak ada placeholder, TODO, tombol mati, atau alur setengah jadi yang boleh masuk ke branch yang di-deploy.

Urutan prioritas saat trade-off (dari brief, tidak berubah):

1. Logika stok benar & selisih bisa ditelusuri — **ini yang paling menentukan, di atas segalanya.**
2. Kelengkapan fitur sesuai PRD.
3. Kemudahan pakai untuk operator gudang (bukan developer).
4. Kualitas teknis.

Stack wajib: **Next.js + TypeScript + Supabase (Postgres)**.

---

## 2. Aturan Keras yang Tidak Boleh Dilanggar Kode Apa Pun

Ini rangkuman dari SRS — kalau kode yang dihasilkan agent melanggar salah satu poin ini, anggap gagal review meskipun "jalan":

- **Tidak ada `UPDATE`/`DELETE` ke `stock_ledger`.** Privilege itu harus dicabut di level DB (migration), bukan sekadar dihindari di application code. Koreksi = `INSERT` entri baru (`manual_correction` atau `opname_correction`), tidak pernah mengubah baris lama.
- **Semua penulisan ledger lewat RPC/Server Action**, tidak pernah `INSERT` langsung dari client/browser ke tabel ledger.
- **Retur rusak/hilang TIDAK menulis ledger movement kedua.** Stok sudah terpotong saat `SHIPPED`/`IN_TRANSIT`. Kalau ada kode yang menulis ledger lagi saat kondisi retur diputuskan jadi rusak/hilang, itu bug double-count — cek SRS FR-504/FR-505 sebelum "memperbaiki" apa pun di area ini.
- **Retur layak jual masuk ke batch BARU (`origin = retur`), bukan batch asal.**
- **Reason ≠ Channel.** Dua kolom terpisah, jangan digabung jadi satu enum atau satu dropdown.
- **Reason `bonus`/`promo`/`sample` wajib punya `reference_note`.** Validasi ini tidak boleh dilewati "supaya form lebih cepat" — itu justru fitur inti (BR-15).
- **FEFO otomatis, tidak ada UI untuk operator memilih batch manual.**
- **Bundle di-split lewat resep yang di-versioning.** Order lama harus tetap memakai versi resep saat order dibuat, bukan versi terbaru — jangan "sederhanakan" jadi selalu pakai versi terbaru.
- **Tidak ada field harga/uang di entitas manapun.** Kalau ada kebutuhan yang kelihatannya butuh nilai uang, itu di luar scope — tanyakan, jangan tambahkan sendiri.
- **1 role: Admin.** Jangan membangun sub-role/approval berjenjang yang tidak diminta — itu justru menyalahi Sync Update v2.
- **Idempotency wajib** untuk semua event dari adapter import/simulasi (dan nanti webhook asli) — pakai `idempotency_key`, cek duplikasi sebelum insert.
- **Layar konfirmasi hanya di titik commit permanen** (stock-out manual, koreksi). Jangan tambahkan konfirmasi di langkah-langkah lain — itu bukan "lebih aman", itu melawan requirement usability (satu titik friksi yang disengaja, bukan berulang).

Kalau ragu antara mengikuti dokumen ini vs insting umum soal "praktik CRUD yang baik", **ikuti dokumen ini** — sistem ini sengaja tidak dirancang seperti CRUD biasa.

---

## 3. Alur Kerja yang Diharapkan dari Agent

1. **Rencana dulu, tautkan ke FR/BR spesifik.** Sebelum menulis kode untuk sebuah fitur, kutip ID requirement dari SRS (mis. "mengerjakan FR-404, FR-407") supaya jelas kode ini menjawab requirement yang mana.
2. **Migration sebelum kode aplikasi**, khususnya untuk: `stock_ledger` (append-only lock), `stock_balance_summary` (cache saldo), `bundle_recipe_version`. Skema mengikuti SRS §4, boleh disesuaikan tapi jangan menghapus properti inti (immutability, versioning, idempotency key).
3. **Tulis test untuk kasus edge dulu, bukan cuma happy path**, minimal:
   - Batal sebelum vs sesudah titik potong SHIPPED/IN_TRANSIT.
   - Retur layak jual vs rusak vs hilang (pastikan rusak/hilang tidak menulis ledger kedua).
   - Bundle split dengan resep versi lama vs versi baru.
   - Event yang sama dikirim dua kali (idempotency).
   - Saldo hasil `stock_balance_summary` vs hasil `SUM` manual dari ledger harus selalu sama.
4. **Tidak ada TODO/placeholder yang dibiarkan.** Kalau suatu bagian belum bisa diselesaikan dalam satu sesi, laporkan eksplisit ke pengguna — jangan commit dengan komentar `// TODO: implement later` sebagai jalan keluar.
5. **Sebelum submit/PR**: jalankan build, jalankan test, dan lakukan pengecekan manual satu siklus penuh (order → shipped → retur → opname) di environment yang di-deploy, karena submission harus live dan bisa langsung dicoba.

---

## 4. Kapan Memanggil Skill `hallmark` (Anti-AI-Slop Design)

**Trigger**: setiap kali agent akan membuat atau mengedit UI baru — halaman, komponen, form, dashboard, layar konfirmasi — sebelum menulis JSX/markup.

**Tujuan skill ini dalam konteks proyek**: mencegah UI yang terlihat generik/"template AI" — penting karena kriteria penilaian #3 di brief adalah kemudahan pakai untuk operator gudang, dan UI yang terasa asal-jadi langsung menurunkan kepercayaan pengguna non-teknis terhadap keakuratan datanya.

**Cara pakai**:

1. Load `hallmark` skill dulu (baca `SKILL.md`-nya) sebelum membangun tampilan.
2. Terapkan panduannya di atas struktur yang sudah ada — proyek ini **menggunakan template dasar yang sudah ditentukan** (lihat DESIGN.md bila tersedia di repo), jadi skill `hallmark` dipakai untuk kualitas eksekusi visual (warna, tipografi, hierarki, microcopy Bahasa Indonesia yang natural untuk gudang) — bukan untuk membangun ulang layout dari nol.
3. Perhatian khusus untuk layar berikut, karena paling sering disentuh operator harian: Dashboard Stok, Form Input Cepat, Layar Konfirmasi commit, dan worklist Rekonsiliasi/Klaim — pastikan hasilnya terasa dirancang untuk konteks gudang skincare Indonesia, bukan dashboard admin generik.
4. Kalau skill tidak tersedia saat dibutuhkan: lanjutkan dengan penilaian desain terbaik agent sendiri, tapi sebut eksplisit di ringkasan kerja bahwa langkah ini dilewati.

---

## 5. Kapan Memanggil Skill `supabase`

**Trigger**: setiap kali agent mengerjakan apa pun yang menyentuh database/backend — schema migration, RLS policy, RPC/Server Action untuk menulis ledger, trigger untuk `stock_balance_summary`, setup Supabase Auth.

**Tujuan skill ini dalam konteks proyek**: memastikan pola Supabase yang dipakai (migration, RLS, RPC, triggers) mengikuti praktik yang benar dan konsisten — terutama karena requirement immutability (§2 di atas) dan performa O(1) saldo bergantung sepenuhnya pada implementasi database yang tepat, bukan hanya logika di application layer.

**Cara pakai**:

1. Load `supabase` skill sebelum menulis migration baru atau RPC baru.
2. Prioritas implementasi yang harus dicek lewat skill ini:
   - Cara mencabut privilege `UPDATE`/`DELETE` pada tabel `stock_ledger` dengan benar (role-level grants, bukan sekadar RLS policy yang bisa terlewat).
   - Pola RPC/Server Action yang aman untuk penulisan ledger (transaksional, tidak race condition saat FEFO mengalokasikan batch bersamaan).
   - Trigger atau pola setara untuk menjaga `stock_balance_summary` tetap sinkron dengan ledger dalam transaksi yang sama.
   - RLS policy untuk memastikan hanya pengguna terautentikasi yang bisa akses data (role tunggal `admin`, tidak perlu policy berjenjang).
   - Setup Supabase Auth untuk login email+password.
3. Kalau skill tidak tersedia: implementasi tetap boleh jalan pakai pengetahuan umum Postgres/Supabase agent, tapi sebut eksplisit di ringkasan kerja, dan berhati-hati khusus pada bagian immutability (§2) — ini bukan area untuk "kira-kira benar".

---

## 6. Definition of Done per Fitur

Sebuah fitur dianggap selesai kalau, dan hanya kalau:

- [ ] Requirement ID (FR-xxx/BR-xxx) yang relevan terpenuhi, dicek ulang terhadap SRS.
- [ ] Tidak ada penulisan saldo stok di luar `stock_ledger` insert.
- [ ] Test untuk kasus edge terkait (lihat §3.3) ada dan lulus.
- [ ] UI sudah melalui skill `hallmark` (atau dicatat kalau dilewati).
- [ ] Perubahan schema/RLS/RPC sudah melalui skill `supabase` (atau dicatat kalau dilewati).
- [ ] Tidak ada TODO/placeholder/console.log debug yang tertinggal.
- [ ] Sudah dicoba end-to-end di environment live/deploy, bukan cuma lokal.
