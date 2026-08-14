import type { TourProgress, TourStatus } from "./types"

const STORAGE_PREFIX = "onboarding"
type UserId = string | null | undefined

export interface OnboardingProgressStorage {
  load(userId: UserId, tourId: string, version: number): TourProgress
  save(userId: UserId, tourId: string, version: number, progress: TourProgress): void
}

export function getProgressStorageKey(userId: UserId, tourId: string, version: number): string | null {
  if (!userId) return null
  return `${STORAGE_PREFIX}:${encodeURIComponent(userId)}:${encodeURIComponent(tourId)}:v${version}`
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isTourProgress(value: unknown, version: number): value is TourProgress {
  if (!value || typeof value !== "object") return false
  const progress = value as Partial<TourProgress>
  return (
    (progress.status === "not_started" ||
      progress.status === "in_progress" ||
      progress.status === "completed" ||
      progress.status === "skipped") &&
    typeof progress.currentStep === "number" &&
    Number.isInteger(progress.currentStep) &&
    progress.currentStep >= 0 &&
    (typeof progress.startedAt === "string" || progress.startedAt === null) &&
    (typeof progress.completedAt === "string" || progress.completedAt === null) &&
    (typeof progress.skippedAt === "string" || progress.skippedAt === null) &&
    progress.version === version
  )
}

export const localStorageProgressStorage: OnboardingProgressStorage = {
  load(userId, tourId, version) {
    const storageKey = getProgressStorageKey(userId, tourId, version)
    const storage = getLocalStorage()
    if (!storageKey || !storage) return defaultProgress(version)

    try {
      const raw = storage.getItem(storageKey)
      if (!raw) return defaultProgress(version)
      const parsed: unknown = JSON.parse(raw)
      return isTourProgress(parsed, version) ? parsed : defaultProgress(version)
    } catch {
      return defaultProgress(version)
    }
  },

  save(userId, tourId, version, progress) {
    const storageKey = getProgressStorageKey(userId, tourId, version)
    const storage = getLocalStorage()
    if (!storageKey || !storage) return

    try {
      storage.setItem(storageKey, JSON.stringify(progress))
    } catch {
      // localStorage can be unavailable or full; onboarding remains optional.
    }
  },
}

/** Baca progres dari adapter yang aman untuk SSR dan localStorage yang tidak tersedia. */
export function loadProgress(userId: UserId, tourId: string, version: number): TourProgress {
  return localStorageProgressStorage.load(userId, tourId, version)
}

/** Simpan progres melalui adapter persistence onboarding. */
export function saveProgress(userId: UserId, tourId: string, version: number, progress: TourProgress): void {
  localStorageProgressStorage.save(userId, tourId, version, progress)
}

function defaultProgress(version: number): TourProgress {
  return {
    status: "not_started",
    currentStep: 0,
    startedAt: null,
    completedAt: null,
    skippedAt: null,
    version,
  }
}

export function makeProgress(status: TourStatus, currentStep: number, version: number): TourProgress {
  const now = new Date().toISOString()
  return {
    status,
    currentStep,
    startedAt: status === "in_progress" ? now : null,
    completedAt: status === "completed" ? now : null,
    skippedAt: status === "skipped" ? now : null,
    version,
  }
}

export function resetProgress(userId: UserId, tourId: string, version: number): void {
  saveProgress(userId, tourId, version, defaultProgress(version))
}
