import type { TourConfig, TourStep } from "../types"

type PageTour = Omit<TourConfig, "version" | "roles" | "autoStart">

function createPageTour(config: PageTour): TourConfig {
  return {
    ...config,
    version: 1,
    roles: ["admin"],
    autoStart: true,
  }
}

function step(
  id: string,
  target: string,
  title: string,
  description: string,
  position: TourStep["position"] = "bottom",
): TourStep {
  return { id, target: `[data-tour="${target}"]`, title, description, position }
}

export const dashboardTour = createPageTour({
  id: "dashboard",
  route: "/dashboard",
  title: "Tutorial Dashboard",
  description: "Kenali ringkasan stok dan area kerja utama Anda.",
  steps: [
    step("dashboard-header", "dashboard-header", "Ringkasan stok", "Dashboard memberi gambaran cepat kondisi stok terkini."),
    step("dashboard-summary", "dashboard-summary", "Kartu ringkasan", "Gunakan angka ringkasan untuk menemukan area yang perlu ditindaklanjuti."),
    step("dashboard-stock", "dashboard-stock", "Stok kritis", "Pantau produk yang perlu segera diperiksa atau diisi kembali."),
    step("dashboard-reconciliation", "dashboard-reconciliation", "Rekonsiliasi", "Mulai pemeriksaan selisih dari pintasan rekonsiliasi di area ini."),
  ],
})

export const simulationTour = createPageTour({
  id: "simulation",
  route: "/simulation",
  title: "Tutorial Simulasi Marketplace",
  description: "Pelajari alur import dan simulasi event marketplace.",
  steps: [
    step("simulation-header", "simulation-header", "Simulasi event", "Halaman ini membantu menguji event marketplace tanpa webhook produksi."),
    step("simulation-channel", "simulation-channel", "Pilih channel", "Pisahkan channel agar sumber setiap event tetap dapat ditelusuri."),
    step("simulation-order", "simulation-order", "Data order", "Masukkan data order dan item yang akan diproses oleh simulasi."),
    step("simulation-status", "simulation-status", "Jalankan event", "Perubahan status diproses idempotent dan tercatat sesuai alur stok."),
  ],
})

export const movementsTour = createPageTour({
  id: "movements",
  route: "/movements",
  title: "Tutorial Stock Ledger",
  description: "Baca seluruh jejak pergerakan stok dari satu halaman.",
  steps: [
    step("movements-header", "movements-header", "Stock Ledger", "Semua perubahan stok tampil sebagai entri ledger yang dapat ditelusuri."),
    step("movements-filters", "movements-filters", "Filter pergerakan", "Saring berdasarkan produk, alasan, channel, atau rentang waktu."),
    step("movements-table", "movements-table", "Daftar entri", "Gunakan daftar ini untuk menelusuri kapan dan mengapa saldo berubah."),
    step("movements-detail", "movements-detail", "Detail jejak", "Buka detail referensi untuk menghubungkan entri dengan event asalnya."),
  ],
})

export const newMovementTour = createPageTour({
  id: "movements-new",
  route: "/movements/new",
  title: "Tutorial Input Manual",
  description: "Catat penerimaan atau koreksi stok dengan alasan yang jelas.",
  steps: [
    step("movements-new-header", "movements-new-header", "Input manual", "Gunakan form ini hanya untuk pergerakan yang memang perlu dicatat manual."),
    step("movements-new-product", "movements-new-product", "Pilih produk", "Pilih produk dan batch sesuai data fisik yang diterima atau diperiksa."),
    step("movements-new-reason", "movements-new-reason", "Alasan dan catatan", "Reason dan channel terpisah; reason bonus, promo, atau sample wajib memiliki catatan."),
    step("movements-new-submit", "movements-new-submit", "Simpan permanen", "Periksa kembali sebelum menyimpan karena entri ledger bersifat append-only."),
  ],
})

export const returnsTour = createPageTour({
  id: "returns",
  route: "/returns",
  title: "Tutorial Retur",
  description: "Kelola retur dan lanjutkan inspeksi kondisi barang.",
  steps: [
    step("returns-header", "returns-header", "Worklist retur", "Daftar ini berisi retur yang menunggu pencatatan dan inspeksi."),
    step("returns-filters", "returns-filters", "Filter retur", "Gunakan filter untuk memprioritaskan retur berdasarkan status atau deadline klaim."),
    step("returns-table", "returns-table", "Detail retur", "Periksa order, channel, dan tanggal retur sebelum mengambil tindakan."),
    step("returns-inspect", "returns-inspect", "Buka inspeksi", "Inspeksi menentukan apakah barang layak jual, rusak, atau hilang."),
  ],
})

export const returnInspectionTour = createPageTour({
  id: "return-inspection",
  route: "/returns/:id/inspect",
  title: "Tutorial Inspeksi Retur",
  description: "Tentukan kondisi retur tanpa menggandakan pergerakan stok.",
  steps: [
    step("return-inspect-header", "return-inspect-header", "Detail retur", "Pastikan order dan channel yang tampil sesuai dengan barang yang diperiksa."),
    step("return-inspect-items", "return-inspect-items", "Item pesanan", "Gunakan daftar item sebagai acuan jumlah dan produk yang kembali."),
    step("return-inspect-condition", "return-inspect-condition", "Kondisi barang", "Barang layak jual masuk batch baru; barang rusak atau hilang tidak menambah stok."),
    step("return-inspect-submit", "return-inspect-submit", "Simpan inspeksi", "Simpan hasil inspeksi dan catatan agar keputusan retur dapat diaudit."),
  ],
})

export const promoRulesTour = createPageTour({
  id: "promo-rules",
  route: "/promo-rules",
  title: "Tutorial Aturan Promo",
  description: "Atur perilaku stok untuk bonus, promo, dan sample.",
  steps: [
    step("promo-rules-header", "promo-rules-header", "Aturan promo", "Aturan promo menjelaskan bagaimana event khusus dipetakan ke pencatatan stok."),
    step("promo-rules-add", "promo-rules-add", "Tambah aturan", "Buat aturan baru dengan reason dan referensi yang mudah ditelusuri."),
    step("promo-rules-table", "promo-rules-table", "Daftar aturan", "Tinjau aturan aktif sebelum mengimpor event marketplace."),
    step("promo-rules-form", "promo-rules-form", "Detail aturan", "Simpan penjelasan yang cukup agar operator lain memahami konteksnya."),
  ],
})

export const opnameTour = createPageTour({
  id: "reconciliation-opname",
  route: "/reconciliation/opname",
  title: "Tutorial Stock Opname",
  description: "Bandingkan stok fisik dengan saldo sistem dan catat koreksinya.",
  steps: [
    step("opname-header", "reconciliation-opname-header", "Stock opname", "Mulai opname dari daftar produk yang akan dihitung secara fisik."),
    step("opname-product", "reconciliation-opname-product", "Produk yang dihitung", "Pastikan produk dan batch yang dipilih sesuai area penyimpanan."),
    step("opname-quantity", "reconciliation-opname-quantity", "Jumlah fisik", "Masukkan hasil hitung fisik, bukan saldo yang terlihat di sistem."),
    step("opname-submit", "reconciliation-opname-submit", "Konfirmasi koreksi", "Konfirmasi sekali pada titik simpan; koreksi baru menambah jejak ledger."),
  ],
})

export const dailyReconciliationTour = createPageTour({
  id: "reconciliation-daily",
  route: "/reconciliation/daily",
  title: "Tutorial Cek Konsistensi",
  description: "Temukan perbedaan antara ringkasan saldo dan ledger.",
  steps: [
    step("daily-header", "reconciliation-daily-header", "Cek konsistensi", "Gunakan halaman ini untuk pemeriksaan rutin pencatatan stok."),
    step("daily-run", "reconciliation-daily-run", "Jalankan pemeriksaan", "Pemeriksaan membandingkan saldo ringkasan dengan pergerakan yang tercatat."),
    step("daily-results", "reconciliation-daily-results", "Hasil pemeriksaan", "Prioritaskan item yang memiliki selisih atau data yang belum lengkap."),
    step("daily-detail", "reconciliation-daily-detail", "Telusuri penyebab", "Buka detail untuk menelusuri entri ledger yang membentuk saldo."),
  ],
})

export const reconciliationReportTour = createPageTour({
  id: "reconciliation-report",
  route: "/reconciliation/report",
  title: "Tutorial Laporan Selisih",
  description: "Gunakan laporan untuk meninjau dan menindaklanjuti selisih stok.",
  steps: [
    step("report-header", "reconciliation-report-header", "Laporan selisih", "Laporan merangkum selisih berdasarkan periode dan produk."),
    step("report-filters", "reconciliation-report-filters", "Filter laporan", "Atur periode dan filter agar hasil sesuai kebutuhan pemeriksaan."),
    step("report-summary", "reconciliation-report-summary", "Ringkasan selisih", "Ringkasan membantu menentukan selisih mana yang perlu ditindaklanjuti dulu."),
    step("report-table", "reconciliation-report-table", "Detail laporan", "Gunakan detail sebagai pintu masuk ke jejak penyebab selisih."),
  ],
})

export const productsTour = createPageTour({
  id: "products",
  route: "/products",
  title: "Tutorial Produk & Batch",
  description: "Kelola data produk dan batch untuk menjaga FEFO tetap akurat.",
  steps: [
    step("products-header", "products-header", "Produk & batch", "Halaman ini adalah sumber data produk dan batch yang digunakan dalam transaksi."),
    step("products-filters", "products-filters", "Cari produk", "Gunakan pencarian dan filter untuk menemukan SKU dengan cepat."),
    step("products-table", "products-table", "Daftar produk", "Tinjau status aktif, saldo, dan batch tanpa mengubah jejak ledger."),
    step("products-add", "products-add", "Tambah produk", "Tambahkan master data produk sebelum membuat pergerakan stok."),
  ],
})

export const referenceDataTour = createPageTour({
  id: "reference-data",
  route: "/products/reference-data",
  title: "Tutorial Data Referensi",
  description: "Kelola channel marketplace dan alasan pergerakan secara terpisah.",
  steps: [
    step("reference-data-header", "reference-data-header", "Data referensi", "Data referensi menjaga pilihan channel dan reason tetap konsisten."),
    step("reference-data-channels", "reference-data-channels", "Channel", "Channel menunjukkan asal event, misalnya Shopee atau TikTok Shop."),
    step("reference-data-reasons", "reference-data-reasons", "Reason", "Reason menjelaskan penyebab pergerakan dan bukan pengganti channel."),
    step("reference-data-add", "reference-data-add", "Tambah referensi", "Tambahkan pilihan baru hanya jika memang diperlukan oleh alur operasional."),
  ],
})

export const usersTour = createPageTour({
  id: "users",
  route: "/users",
  title: "Tutorial Kelola Pengguna",
  description: "Kelola akses akun admin secara terpusat.",
  steps: [
    step("users-header", "users-header", "Kelola pengguna", "Halaman ini menampilkan akun yang dapat mengakses aplikasi."),
    step("users-table", "users-table", "Daftar akun", "Periksa status dan identitas akun tanpa menampilkan data sensitif tambahan."),
    step("users-add", "users-add", "Tambah pengguna", "Undang atau tambahkan akun baru sesuai proses akses yang berlaku."),
    step("users-role", "users-role", "Peran akses", "Saat ini aplikasi memakai satu peran admin; struktur ini siap diperluas tanpa sub-role baru."),
  ],
})

export const profileTour = createPageTour({
  id: "profile",
  route: "/profile",
  title: "Tutorial Profil",
  description: "Perbarui informasi akun dan keamanan login Anda.",
  steps: [
    step("profile-header", "profile-header", "Profil akun", "Gunakan halaman profil untuk mengelola informasi akun Anda sendiri."),
    step("profile-account", "profile-account", "Informasi akun", "Periksa identitas akun sebelum menyimpan perubahan."),
    step("profile-password", "profile-password", "Keamanan akun", "Gunakan kontrol keamanan untuk menjaga akses akun tetap terlindungi."),
    step("profile-save", "profile-save", "Simpan perubahan", "Simpan hanya setelah semua perubahan sudah diperiksa."),
  ],
})
