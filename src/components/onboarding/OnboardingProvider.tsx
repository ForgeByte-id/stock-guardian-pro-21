"use client"

import { createContext, useCallback, useEffect, useRef, useState } from "react"
import { useRouterState } from "@tanstack/react-router"
import type { TourConfig, TourProgress } from "@/lib/onboarding/types"
import { getTourById, getToursForRoute, getAllTours } from "@/lib/onboarding/registry"
import {
  localStorageProgressStorage,
  makeProgress,
  type OnboardingProgressStorage,
} from "@/lib/onboarding/storage"
import { OnboardingTour } from "./OnboardingTour"

export const OnboardingContext = createContext<OnboardingContextValue | null>(null)

export interface OnboardingContextValue {
  activeTour: TourConfig | null
  activeStepIndex: number
  isActive: boolean
  startTour: (tourId: string) => Promise<void>
  startCurrentPageTour: () => Promise<void>
  restartTour: (tourId: string) => Promise<void>
  nextStep: () => void
  previousStep: () => void
  skipTour: () => void
  completeTour: () => void
  isTourCompleted: (tourId: string) => boolean
  getAvailableTours: (role?: string) => TourConfig[]
  getProgress: (tourId: string) => TourProgress | null
}

function progressCacheKey(userId: string | null | undefined, tourId: string, version: number): string {
  return `${userId ?? "anonymous"}:${tourId}:v${version}`
}

export function OnboardingProvider({
  children,
  userId,
  storage = localStorageProgressStorage,
}: {
  children: React.ReactNode
  /** undefined means auth is still initializing; null means signed out. */
  userId?: string | null
  storage?: OnboardingProgressStorage
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [activeTour, setActiveTour] = useState<TourConfig | null>(null)
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [progressMap, setProgressMap] = useState<Record<string, TourProgress>>({})
  const startedTours = useRef<Set<string>>(new Set())
  const tourRef = useRef<TourConfig | null>(null)
  const currentUserId = useRef(userId)

  // ——— Mutex: cegah tour dimulai ulang dua kali ———
  const mutex = useRef(false)

  const getCachedProgress = useCallback((id: string, version: number): TourProgress => {
    const progressKey = progressCacheKey(userId, id, version)
    if (progressMap[progressKey]) return progressMap[progressKey]
    const p = storage.load(userId, id, version)
    setProgressMap((m) => ({ ...m, [progressKey]: p }))
    return p
  }, [progressMap, storage, userId])

  // User identity is a persistence boundary; never retain another user's tour state.
  useEffect(() => {
    if (currentUserId.current === userId) return
    currentUserId.current = userId
    startedTours.current.clear()
    tourRef.current = null
    mutex.current = false
    setActiveTour(null)
    setActiveStepIndex(0)
    setProgressMap({})
  }, [userId])

  // ——— Saat route berubah, cek autoStart ———
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!userId) return
    if (mutex.current) return

    const tours = getToursForRoute(pathname)
    for (const t of tours) {
      if (!t.autoStart) continue
      const progressKey = progressCacheKey(userId, t.id, t.version)
      const prog = getCachedProgress(t.id, t.version)
      if (prog.status === "not_started" && !startedTours.current.has(progressKey)) {
        startedTours.current.add(progressKey)
        mutex.current = true
        setActiveTour(t)
        setActiveStepIndex(0)
        // update progres
        const p = makeProgress("in_progress", 0, t.version)
        storage.save(userId, t.id, t.version, p)
        setProgressMap((m) => ({ ...m, [progressKey]: p }))
        break // hanya satu tour per route
      }
    }
  }, [pathname, userId, storage, getCachedProgress])

  const refreshProgress = useCallback((id: string, version: number) => {
    const progressKey = progressCacheKey(userId, id, version)
    const p = storage.load(userId, id, version)
    setProgressMap((m) => ({ ...m, [progressKey]: p }))
    return p
  }, [storage, userId])

  const startTour = useCallback(async (tourId: string) => {
    if (!userId) return
    const tour = getTourById(tourId)
    if (!tour) return
    const progressKey = progressCacheKey(userId, tourId, tour.version)
    const p = refreshProgress(tourId, tour.version)
    if (p.status === "completed") {
      // reset dulu
      const fresh = makeProgress("in_progress", 0, tour.version)
      storage.save(userId, tourId, tour.version, fresh)
      setProgressMap((m) => ({ ...m, [progressKey]: fresh }))
    } else {
      const fresh = makeProgress("in_progress", p.currentStep, tour.version)
      storage.save(userId, tourId, tour.version, fresh)
      setProgressMap((m) => ({ ...m, [progressKey]: fresh }))
    }
    tourRef.current = tour
    setActiveTour(tour)
    setActiveStepIndex(0)
  }, [refreshProgress, storage, userId])

  const startCurrentPageTour = useCallback(async () => {
    if (typeof window === "undefined") return
    const tours = getToursForRoute(window.location.pathname)
    if (tours.length > 0) {
      await startTour(tours[0].id)
    }
  }, [startTour])

  const restartTour = useCallback(async (tourId: string) => {
    const tour = getTourById(tourId)
    if (!tour) return
    if (!userId) return
    const progressKey = progressCacheKey(userId, tourId, tour.version)
    const fresh = makeProgress("not_started", 0, tour.version)
    storage.save(userId, tourId, tour.version, fresh)
    setProgressMap((m) => ({ ...m, [progressKey]: fresh }))
    await startTour(tourId)
  }, [startTour, storage, userId])

  const nextStep = useCallback(() => {
    setActiveStepIndex((i) => {
      if (!activeTour) return i
      const next = i + 1
      if (next >= activeTour.steps.length) {
        completeTourInternal()
        return i
      }
      return next
    })
  }, [activeTour])

  const previousStep = useCallback(() => {
    setActiveStepIndex((i) => Math.max(0, i - 1))
  }, [])

  const completeTourInternal = useCallback(() => {
    if (!activeTour || !userId) return
    const p = makeProgress("completed", activeTour.steps.length, activeTour.version)
    const progressKey = progressCacheKey(userId, activeTour.id, activeTour.version)
    storage.save(userId, activeTour.id, activeTour.version, p)
    setProgressMap((m) => ({ ...m, [progressKey]: p }))
    activeTour.onComplete?.()
    tourRef.current = null
    mutex.current = false
    setActiveTour(null)
    setActiveStepIndex(0)
  }, [activeTour, storage, userId])

  const skipTour = useCallback(() => {
    if (!activeTour || !userId) return
    const p = makeProgress("skipped", activeTour.steps.length, activeTour.version)
    const progressKey = progressCacheKey(userId, activeTour.id, activeTour.version)
    storage.save(userId, activeTour.id, activeTour.version, p)
    setProgressMap((m) => ({ ...m, [progressKey]: p }))
    activeTour.onSkip?.()
    tourRef.current = null
    mutex.current = false
    setActiveTour(null)
    setActiveStepIndex(0)
  }, [activeTour, storage, userId])

  const completeTour = useCallback(() => {
    completeTourInternal()
  }, [completeTourInternal])

  const isTourCompleted = useCallback((tourId: string): boolean => {
    const tour = getTourById(tourId)
    if (!tour) return false
    const p = getCachedProgress(tourId, tour.version)
    return p.status === "completed"
  }, [getCachedProgress])

  const getAvailableTours = useCallback((role?: string): TourConfig[] => {
    return getAllTours(role)
  }, [])

  const getProgress = useCallback((tourId: string): TourProgress | null => {
    const tour = getTourById(tourId)
    if (!tour) return null
    return getCachedProgress(tourId, tour.version)
  }, [getCachedProgress])

  const identityReady = currentUserId.current === userId
  const visibleActiveTour = identityReady ? activeTour : null
  const value: OnboardingContextValue = {
    activeTour: visibleActiveTour,
    activeStepIndex,
    isActive: visibleActiveTour !== null,
    startTour, startCurrentPageTour, restartTour,
    nextStep, previousStep, skipTour, completeTour,
    isTourCompleted, getAvailableTours, getProgress,
  }

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      {visibleActiveTour && (
        <OnboardingTour
          tour={visibleActiveTour}
          stepIndex={activeStepIndex}
          onNext={nextStep}
          onPrevious={previousStep}
          onSkip={skipTour}
          onComplete={completeTour}
        />
      )}
    </OnboardingContext.Provider>
  )
}
