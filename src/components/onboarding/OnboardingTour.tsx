"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { TourConfig, TourStep } from "@/lib/onboarding/types"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

interface Props {
  tour: TourConfig
  stepIndex: number
  onNext: () => void
  onPrevious: () => void
  onSkip: () => void
  onComplete: () => void
}

const RETRY_MS = 300
const MAX_RETRIES = 10

export function OnboardingTour({ tour, stepIndex, onNext, onPrevious, onSkip, onComplete }: Props) {
  const step = tour.steps[stepIndex]
  const isLast = stepIndex >= tour.steps.length - 1
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [targetFound, setTargetFound] = useState(true)
  const popoverRef = useRef<HTMLDivElement>(null)
  const retryCount = useRef(0)
  const pendingTimers = useRef<number[]>([])

  const clearPendingTimers = useCallback(() => {
    pendingTimers.current.forEach((timer) => window.clearTimeout(timer))
    pendingTimers.current = []
  }, [])

  const positionPopover = useCallback((rect: DOMRect, pos: string) => {
    const pw = 360
    const ph = 220
    let top = 0, left = 0

    switch (pos) {
      case "top":
        top = rect.top - ph - 12
        left = rect.left + rect.width / 2 - pw / 2
        break
      case "bottom":
        top = rect.bottom + 12
        left = rect.left + rect.width / 2 - pw / 2
        break
      case "left":
        top = rect.top + rect.height / 2 - ph / 2
        left = rect.left - pw - 12
        break
      case "right":
        top = rect.top + rect.height / 2 - ph / 2
        left = rect.right + 12
        break
    }
    // clamp ke viewport
    top = Math.max(12, Math.min(top, window.innerHeight - ph - 12))
    left = Math.max(12, Math.min(left, window.innerWidth - pw - 12))
    setPopoverPos({ top, left })
  }, [])

  // ——— Cari target, retry beberapa kali ———
  useEffect(() => {
    clearPendingTimers()
    setTargetRect(null)
    setTargetFound(true)
    if (!step) return

    let disposed = false
    if (step.position === "center") {
      setTargetFound(true)
      setTargetRect(null)
      setPopoverPos({ top: window.innerHeight / 2 - 100, left: window.innerWidth / 2 - 200 })
      return () => {
        disposed = true
        clearPendingTimers()
      }
    }

    retryCount.current = 0
    const findTarget = (selector: string) => {
      if (disposed) return

      const el = document.querySelector(selector)
      if (el) {
        const rect = el.getBoundingClientRect()
        setTargetRect(rect)
        setTargetFound(true)
        // scroll halus ke target
        el.scrollIntoView({ behavior: "smooth", block: "center" })
        // posisi popover
        pendingTimers.current.push(
          window.setTimeout(() => {
            if (!disposed) positionPopover(rect, step.position ?? "bottom")
          }, 400),
        )
        return
      }
      if (retryCount.current < MAX_RETRIES) {
        retryCount.current++
        pendingTimers.current.push(window.setTimeout(() => findTarget(selector), RETRY_MS))
      } else {
        // target tidak ditemukan — lewati langkah
        setTargetFound(false)
        onNext()
      }
    }

    findTarget(step.target)
    return () => {
      disposed = true
      clearPendingTimers()
    }
  }, [clearPendingTimers, onNext, positionPopover, step])

  // ——— Keyboard ———
  useEffect(() => {
    if (!step) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onSkip()
      if (e.key === "ArrowRight" || e.key === "Enter") {
        if (isLast) onComplete()
        else onNext()
      }
      if (e.key === "ArrowLeft") onPrevious()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [step, isLast, onNext, onPrevious, onSkip, onComplete])

  if (!step || !targetFound) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[9998] bg-black/40 transition-opacity duration-300"
        style={{ pointerEvents: targetRect ? "none" : "auto" }}
        onClick={onSkip}
      />

      {/* Highlight pada target */}
      {targetRect && step.position !== "center" && (
        <div
          className="fixed z-[9999] rounded-lg ring-2 ring-white ring-offset-2 ring-offset-black/40 transition-all duration-300"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      )}

      {/* Popover */}
      <div
        ref={popoverRef}
        role="dialog"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-desc"
        className="fixed z-[10000] w-[360px] max-w-[90vw] rounded-xl bg-white shadow-2xl border border-border/50 transition-all duration-200"
        style={{ top: popoverPos.top, left: popoverPos.left }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-4 pt-4 pb-2">
          <div className="space-y-1 min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">
              {tour.title}
            </p>
            <h3 id="onboarding-title" className="text-sm font-semibold leading-snug text-foreground">
              {step.title}
            </h3>
          </div>
          <button
            onClick={onSkip}
            className="shrink-0 ml-2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Tutup tutorial"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 pb-3">
          <p id="onboarding-desc" className="text-xs leading-relaxed text-muted-foreground">
            {step.description}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/30 px-4 py-3">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            Langkah {stepIndex + 1} dari {tour.steps.length}
          </span>
          <div className="flex items-center gap-1.5">
            {stepIndex > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={onPrevious}>
                Kembali
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={onSkip}>
              Lewati
            </Button>
            <Button size="sm" className="h-7 text-xs px-3" onClick={isLast ? onComplete : onNext}>
              {isLast ? "Selesai" : "Lanjut"}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
