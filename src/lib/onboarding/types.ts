export interface TourStep {
  id: string
  /** CSS selector — gunakan `[data-tour="..."]` saja, bukan class atau struktur DOM */
  target: string
  title: string
  description: string
  /** Posisi popover relatif terhadap target */
  position?: "top" | "bottom" | "left" | "right" | "center"
  /** Route tujuan jika langkah berada di halaman lain (lintas halaman) */
  route?: string
  /** Kondisi untuk menampilkan langkah ini */
  condition?: () => boolean
  /** Callback sebelum langkah ditampilkan */
  onBefore?: () => void | Promise<void>
  /** Callback setelah langkah selesai */
  onAfter?: () => void
}

export type TourRole = string
export type TourRoleInput = TourRole | readonly TourRole[] | null

export interface TourConfig {
  id: string
  version: number
  /** Route pattern — cocokkan dengan pathname saat ini */
  route: string
  title: string
  description?: string
  /** Role yang diizinkan — kosongi jika semua role bisa */
  roles?: TourRole[]
  /** Mulai otomatis saat pertama kali buka halaman */
  autoStart: boolean
  steps: TourStep[]
  onComplete?: () => void
  onSkip?: () => void
}

export type TourStatus = "not_started" | "in_progress" | "completed" | "skipped"

export interface TourProgress {
  status: TourStatus
  currentStep: number
  startedAt: string | null
  completedAt: string | null
  skippedAt: string | null
  version: number
}
