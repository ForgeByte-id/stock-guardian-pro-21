"use client"

import { useState } from "react"
import { useOnboarding } from "@/hooks/useOnboarding"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { HelpCircle, Play, RotateCcw, CheckCircle2, Clock } from "lucide-react"

export function OnboardingHelpButton() {
  const { getAvailableTours, isTourCompleted, startTour, restartTour, startCurrentPageTour, getProgress } = useOnboarding()
  const [open, setOpen] = useState(false)

  const tours = getAvailableTours()

  function statusIcon(tourId: string) {
    if (isTourCompleted(tourId)) return <CheckCircle2 className="h-3.5 w-3.5 text-success-foreground" />
    const p = getProgress(tourId)
    if (p?.status === "in_progress" || p?.status === "skipped") return <Clock className="h-3.5 w-3.5 text-muted-foreground" />
    return <Play className="h-3.5 w-3.5 text-muted-foreground" />
  }

  function statusLabel(tourId: string) {
    if (isTourCompleted(tourId)) return "Selesai"
    const p = getProgress(tourId)
    if (p?.status === "in_progress") return "Lanjutkan"
    if (p?.status === "skipped") return "Mulai ulang"
    return "Mulai"
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground"
          aria-label="Bantuan & Tutorial">
          <HelpCircle className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-64">
        <DropdownMenuLabel>Bantuan &amp; Tutorial</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { startCurrentPageTour(); setOpen(false) }}>
          <Play className="mr-2 h-4 w-4" />
          <span>Mulai tutorial halaman ini</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal">
          Semua Tutorial
        </DropdownMenuLabel>
        {tours.map((t) => {
          const completed = isTourCompleted(t.id)
          return (
            <DropdownMenuItem key={t.id}
              onClick={() => {
                if (completed) restartTour(t.id)
                else startTour(t.id)
                setOpen(false)
              }}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2 min-w-0">
                {statusIcon(t.id)}
                <span className="text-sm truncate">{t.title}</span>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{statusLabel(t.id)}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
