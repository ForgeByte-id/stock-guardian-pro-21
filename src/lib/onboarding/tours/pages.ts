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
  title: "Tutorial dashboard stok",
  description: "Kenali ringkasan stok dan area kerja utama.",
  steps: [
    step("dashboard-header", "dashboard-header", "Ringkasan stok", "Lihat kondisi stok terkini dari satu halaman."),
    step("dashboard-summary", "dashboard-summary", "Kartu ringkasan", "Gunakan ringkasan untuk melihat bagian yang perlu diperiksa."),
    step("dashboard-stock", "dashboard-stock", "Stok kritis", "Periksa produk dengan stok kritis dan tindak lanjuti sesuai kondisi gudang."),
    step("dashboard-reconciliation", "dashboard-reconciliation", "Rekonsiliasi", "Gunakan area Rekonsiliasi untuk menelusuri selisih stok."),
  ],
})

export const simulationTour = createPageTour({
  id: "simulation",
  route: "/simulation",
  title: "Tutorial simulasi marketplace",
  description: "Pelajari alur import dan simulasi event marketplace.",
  steps: [
    step("simulation-header", "simulation-header", "Simulasi event", "Uji event marketplace tanpa webhook produksi, yaitu jalur event dari marketplace."),
    step("simulation-channel", "simulation-channel", "Pilih Channel", "Pilih Channel agar asal setiap event tetap mudah ditelusuri."),
    step("simulation-order", "simulation-order", "Data order", "Masukkan order dan item yang akan diproses oleh simulasi."),
    step("simulation-status", "simulation-status", "Jalankan event", "Event diproses secara idempotent, yaitu pengiriman ulang tidak membuat catatan ganda."),
  ],
})

export const movementsTour = createPageTour({
  id: "movements",
  route: "/movements",
  title: "Tutorial Stock Ledger",
  description: "Baca seluruh jejak pergerakan stok dari satu halaman.",
  steps: [
    step("movements-header", "movements-header", "Stock Ledger", "Semua perubahan stok tercatat sebagai entri Stock Ledger yang bisa ditelusuri."),
    step("movements-filters", "movements-filters", "Filter pergerakan", "Cari berdasarkan produk, Reason, Channel, atau tanggal."),
    step("movements-table", "movements-table", "Daftar entri", "Telusuri kapan dan mengapa saldo stok berubah."),
    step("movements-detail", "movements-detail", "Detail jejak", "Buka referensi untuk melihat event yang memicu entri ini."),
  ],
})

export const newMovementTour = createPageTour({
  id: "movements-new",
  route: "/movements/new",
  title: "Tutorial input manual",
  description: "Catat barang masuk atau koreksi stok dengan Reason yang jelas.",
  steps: [
    step("movements-new-header", "movements-new-header", "Input manual", "Gunakan form ini untuk mencatat pergerakan secara manual."),
    step("movements-new-product", "movements-new-product", "Pilih produk", "Pilih produk sesuai barang yang diterima atau diperiksa; saat barang keluar, sistem memakai FEFO untuk memilih Batch."),
    step("movements-new-reason", "movements-new-reason", "Reason dan catatan", "Reason dan Channel tetap terpisah. Untuk bonus, promo, atau sample, isi catatan referensi."),
    step("movements-new-submit", "movements-new-submit", "Simpan permanen", "Periksa data sebelum menyimpan. Entri Stock Ledger bersifat append-only dan tidak bisa diedit."),
  ],
})

export const returnsTour = createPageTour({
  id: "returns",
  route: "/returns",
  title: "Tutorial retur",
  description: "Kelola retur dan catat hasil inspeksi kondisi barang.",
  steps: [
    step("returns-header", "returns-header", "Worklist retur", "Lihat retur yang menunggu inspeksi dan pencatatan."),
    step("returns-filters", "returns-filters", "Filter retur", "Gunakan filter status atau tenggat klaim untuk menentukan retur yang perlu diperiksa."),
    step("returns-table", "returns-table", "Detail retur", "Periksa order, Channel, dan tanggal retur sebelum memprosesnya."),
    step("returns-inspect", "returns-inspect", "Buka inspeksi", "Tetapkan kondisi retur: layak jual, rusak, atau hilang."),
  ],
})

export const returnInspectionTour = createPageTour({
  id: "return-inspection",
  route: "/returns/:id/inspect",
  title: "Tutorial inspeksi retur",
  description: "Tentukan kondisi retur tanpa menggandakan pergerakan stok.",
  steps: [
    step("return-inspect-header", "return-inspect-header", "Detail retur", "Pastikan order dan Channel sesuai dengan barang yang diperiksa."),
    step("return-inspect-items", "return-inspect-items", "Item pesanan", "Gunakan daftar item sebagai acuan jumlah dan produk yang kembali."),
    step("return-inspect-condition", "return-inspect-condition", "Kondisi barang", "Barang layak jual masuk ke Batch baru bertanda retur; barang rusak atau hilang tidak membuat pergerakan stok kedua."),
    step("return-inspect-submit", "return-inspect-submit", "Simpan inspeksi", "Simpan kondisi dan catatan inspeksi agar keputusan retur bisa ditelusuri."),
  ],
})

export const promoRulesTour = createPageTour({
  id: "promo-rules",
  route: "/promo-rules",
  title: "Tutorial aturan promo",
  description: "Atur pencatatan stok untuk bonus, promo, dan sample.",
  steps: [
    step("promo-rules-header", "promo-rules-header", "Aturan promo", "Lihat bagaimana event khusus dicatat ke stok."),
    step("promo-rules-add", "promo-rules-add", "Tambah aturan", "Buat aturan dengan Reason dan referensi yang mudah ditelusuri."),
    step("promo-rules-table", "promo-rules-table", "Daftar aturan", "Periksa aturan aktif sebelum memproses event marketplace."),
    step("promo-rules-form", "promo-rules-form", "Detail aturan", "Simpan penjelasan agar konteks aturan mudah dipahami."),
  ],
})

export const opnameTour = createPageTour({
  id: "reconciliation-opname",
  route: "/reconciliation/opname",
  title: "Tutorial stok opname",
  description: "Bandingkan stok fisik dengan saldo sistem dan catat koreksinya.",
  steps: [
    step("opname-header", "reconciliation-opname-header", "Stock opname", "Mulai Stok Opname dari produk yang akan dihitung."),
    step("opname-product", "reconciliation-opname-product", "Produk yang dihitung", "Pastikan produk dan Batch sesuai dengan area penyimpanan."),
    step("opname-quantity", "reconciliation-opname-quantity", "Jumlah fisik", "Masukkan hasil hitung fisik, bukan saldo yang terlihat di sistem."),
    step("opname-submit", "reconciliation-opname-submit", "Konfirmasi koreksi", "Konfirmasi saat siap menyimpan. Koreksi menambah entri baru di Stock Ledger."),
  ],
})

export const dailyReconciliationTour = createPageTour({
  id: "reconciliation-daily",
  route: "/reconciliation/daily",
  title: "Tutorial cek konsistensi",
  description: "Temukan perbedaan antara ringkasan saldo dan Stock Ledger.",
  steps: [
    step("daily-header", "reconciliation-daily-header", "Cek konsistensi", "Gunakan halaman ini untuk pemeriksaan rutin pencatatan stok."),
    step("daily-run", "reconciliation-daily-run", "Jalankan pemeriksaan", "Pemeriksaan membandingkan saldo ringkasan dengan entri Stock Ledger."),
    step("daily-results", "reconciliation-daily-results", "Hasil pemeriksaan", "Periksa item dengan selisih atau data yang belum lengkap."),
    step("daily-detail", "reconciliation-daily-detail", "Telusuri penyebab", "Buka detail untuk menelusuri entri Stock Ledger yang membentuk saldo."),
  ],
})

export const reconciliationReportTour = createPageTour({
  id: "reconciliation-report",
  route: "/reconciliation/report",
  title: "Tutorial laporan selisih",
  description: "Gunakan laporan untuk meninjau dan menindaklanjuti selisih stok.",
  steps: [
    step("report-header", "reconciliation-report-header", "Laporan selisih", "Laporan merangkum selisih berdasarkan periode dan produk."),
    step("report-filters", "reconciliation-report-filters", "Filter laporan", "Pilih periode dan filter agar hasil sesuai kebutuhan pemeriksaan."),
    step("report-summary", "reconciliation-report-summary", "Ringkasan selisih", "Ringkasan membantu menentukan selisih mana yang perlu ditindaklanjuti dulu."),
    step("report-table", "reconciliation-report-table", "Detail laporan", "Buka detail untuk menelusuri penyebab selisih."),
  ],
})

export const productsTour = createPageTour({
  id: "products",
  route: "/products",
  title: "Tutorial produk dan Batch",
  description: "Kelola data produk dan Batch agar alokasi FEFO tetap tepat.",
  steps: [
    step("products-header", "products-header", "Produk dan Batch", "Kelola data produk dan Batch yang dipakai dalam transaksi."),
    step("products-filters", "products-filters", "Cari produk", "Cari berdasarkan nama produk atau SKU untuk menemukan data dengan cepat."),
    step("products-table", "products-table", "Daftar produk", "Periksa status, saldo, dan Batch tanpa mengubah entri Stock Ledger."),
    step("products-add", "products-add", "Tambah produk", "Tambahkan data produk sebelum mencatat pergerakan stok."),
  ],
})

export const referenceDataTour = createPageTour({
  id: "reference-data",
  route: "/products/reference-data",
  title: "Tutorial data referensi",
  description: "Kelola Channel marketplace dan Reason pergerakan secara terpisah.",
  steps: [
    step("reference-data-header", "reference-data-header", "Data referensi", "Data referensi menjaga pilihan Channel dan Reason tetap konsisten."),
    step("reference-data-channels", "reference-data-channels", "Channel", "Channel menunjukkan asal event, misalnya Shopee atau TikTok Shop."),
    step("reference-data-reasons", "reference-data-reasons", "Reason", "Reason menjelaskan penyebab pergerakan, bukan pengganti Channel."),
    step("reference-data-add", "reference-data-add", "Referensi operasional", "Gunakan referensi yang tersedia sesuai kebutuhan alur operasional."),
  ],
})

export const usersTour = createPageTour({
  id: "users",
  route: "/users",
  title: "Tutorial kelola pengguna",
  description: "Kelola akun Admin dari satu halaman.",
  steps: [
    step("users-header", "users-header", "Kelola pengguna", "Lihat akun yang dapat mengakses aplikasi."),
    step("users-table", "users-table", "Daftar akun", "Periksa status dan identitas akun tanpa menampilkan data sensitif tambahan."),
    step("users-add", "users-add", "Tambah pengguna", "Tambahkan akun baru sesuai proses akses yang berlaku."),
    step("users-role", "users-role", "Peran akses", "Aplikasi saat ini memakai satu peran: Admin."),
  ],
})

export const profileTour = createPageTour({
  id: "profile",
  route: "/profile",
  title: "Tutorial profil",
  description: "Perbarui informasi akun dan keamanan login.",
  steps: [
    step("profile-header", "profile-header", "Profil akun", "Kelola informasi akun Anda sendiri dari halaman ini."),
    step("profile-account", "profile-account", "Informasi akun", "Periksa identitas akun sebelum menyimpan perubahan."),
    step("profile-password", "profile-password", "Keamanan akun", "Gunakan bagian ini untuk memperbarui kata sandi."),
    step("profile-save", "profile-save", "Simpan perubahan", "Simpan hanya setelah semua perubahan sudah diperiksa."),
  ],
})
