import type { TourConfig } from "../types"

export const bundlesTour: TourConfig = {
  id: "bundles",
  version: 1,
  route: "/products/bundles",
  title: "Tutorial resep Bundle",
  description: "Pelajari cara kerja Bundle marketplace dan resep komponennya.",
  roles: ["admin"],
  autoStart: true,
  steps: [
    {
      id: "bundles-header",
      target: "[data-tour='bundles-header']",
      title: "Halaman Resep Bundle",
      description:
        "Satu SKU marketplace dapat mewakili Bundle yang berisi beberapa produk maklon. Contoh: 'Paket Sabun & Sampo' berisi 2 produk terpisah.",
      position: "bottom",
    },
    {
      id: "bundles-info",
      target: "[data-tour='bundles-info']",
      title: "Cara kerja Bundle",
      description:
        "Saat pesanan berstatus SHIPPED, sistem memecah Bundle menjadi komponen dan mengurangi stok tiap produk di Stock Ledger. Setiap komponen tercatat sendiri agar jejak stok mudah ditelusuri.",
      position: "bottom",
    },
    {
      id: "bundles-add",
      target: "[data-tour='bundles-add']",
      title: "Buat Bundle baru",
      description:
        "Mulai buat Bundle baru dengan memilih produk komponen dan jumlahnya.",
      position: "left",
    },
    {
      id: "bundles-col-name",
      target: "[data-tour='bundles-col-name']",
      title: "Nama Bundle",
      description:
        "Nama internal Bundle. Gunakan nama yang mudah dikenali, seperti 'Paket Hadiah Lebaran'.",
      position: "bottom",
    },
    {
      id: "bundles-col-sku",
      target: "[data-tour='bundles-col-sku']",
      title: "Nama SKU marketplace",
      description:
        "Nama SKU yang tampil di toko marketplace. Bisa berbeda dari nama internal Bundle. Contoh: 'Sabun Sampo 500ml — 1 pack'.",
      position: "bottom",
    },
    {
      id: "bundles-col-components",
      target: "[data-tour='bundles-col-components']",
      title: "Komponen Bundle",
      description:
        "Daftar produk maklon dan jumlah tiap produk dalam Bundle. Contoh: Sabun ×1, Sampo ×1, Lulur ×2.",
      position: "bottom",
    },
  ],
}
