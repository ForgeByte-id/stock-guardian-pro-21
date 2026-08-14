import type { TourConfig } from "../types"

export const bundlesTour: TourConfig = {
  id: "bundles",
  version: 1,
  route: "/products/bundles",
  title: "Tutorial Resep Bundle",
  description: "Pelajari cara membuat bundle produk marketplace yang terdiri dari beberapa produk maklon.",
  roles: ["admin"],
  autoStart: true,
  steps: [
    {
      id: "bundles-header",
      target: "[data-tour='bundles-header']",
      title: "Halaman Resep Bundle",
      description:
        "Bundle adalah satu SKU marketplace yang berisi beberapa produk maklon. Contoh: 'Paket Sabun & Sampo' sebenarnya berisi 2 produk terpisah.",
      position: "bottom",
    },
    {
      id: "bundles-info",
      target: "[data-tour='bundles-info']",
      title: "Cara Kerja Bundle",
      description:
        "Saat pesanan dengan bundle dikirim (SHIPPED), sistem otomatis memecah bundle dan mengurangi stok setiap komponen secara terpisah di Stock Ledger. Stok akan selalu akurat karena setiap komponen dicatat sendiri.",
      position: "bottom",
    },
    {
      id: "bundles-add",
      target: "[data-tour='bundles-add']",
      title: "Buat Bundle Baru",
      description:
        "Klik tombol ini untuk mulai membuat bundle. Anda akan memilih produk maklon yang termasuk di dalamnya dan jumlah masing-masing.",
      position: "left",
    },
    {
      id: "bundles-col-name",
      target: "[data-tour='bundles-col-name']",
      title: "Nama Bundle",
      description:
        "Nama internal bundle yang Anda buat. Gunakan nama yang mudah dikenali, seperti 'Paket Hadiah Lebaran'.",
      position: "bottom",
    },
    {
      id: "bundles-col-sku",
      target: "[data-tour='bundles-col-sku']",
      title: "Nama SKU Marketplace",
      description:
        "Nama produk seperti yang tampil di halaman toko marketplace. Bisa berbeda dari nama internal bundle. Contoh: 'Sabun Sampo 500ml — 1 pack'.",
      position: "bottom",
    },
    {
      id: "bundles-col-components",
      target: "[data-tour='bundles-col-components']",
      title: "Komponen",
      description:
        "Daftar produk maklon yang membentuk bundle ini beserta jumlahnya. Misal: Sabun ×1, Sampo ×1, Lulur ×2.",
      position: "bottom",
    },
  ],
}
