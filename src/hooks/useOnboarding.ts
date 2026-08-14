import { useContext } from "react"
import {
  OnboardingContext,
  type OnboardingContextValue,
} from "@/components/onboarding/OnboardingProvider"

export function useOnboarding() {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error("useOnboarding must be used within <OnboardingProvider>")

  return {
    /** Tour yang sedang aktif (atau null) */
    activeTour: ctx.activeTour,
    activeStepIndex: ctx.activeStepIndex,
    isActive: ctx.isActive,

    /** Mulai tour berdasarkan ID */
    startTour: ctx.startTour,
    /** Mulai tour untuk halaman saat ini (otomatis dari registry) */
    startCurrentPageTour: ctx.startCurrentPageTour,
    restartTour: ctx.restartTour,

    nextStep: ctx.nextStep,
    previousStep: ctx.previousStep,
    skipTour: ctx.skipTour,
    completeTour: ctx.completeTour,

    isTourCompleted: ctx.isTourCompleted,
    getAvailableTours: ctx.getAvailableTours,
    getProgress: ctx.getProgress,
  }
}

/** Default value untuk context — mencegah error saat provider belum siap */
export const defaultContext: OnboardingContextValue = {
  activeTour: null,
  activeStepIndex: 0,
  isActive: false,
  startTour: async () => {},
  startCurrentPageTour: async () => {},
  restartTour: async () => {},
  nextStep: () => {},
  previousStep: () => {},
  skipTour: () => {},
  completeTour: () => {},
  isTourCompleted: () => false,
  getAvailableTours: () => [],
  getProgress: () => null,
}
