import type { TourConfig } from "./types"
import { bundlesTour } from "./tours/bundles"
import {
  dashboardTour,
  dailyReconciliationTour,
  movementsTour,
  newMovementTour,
  opnameTour,
  productsTour,
  profileTour,
  promoRulesTour,
  reconciliationReportTour,
  referenceDataTour,
  returnInspectionTour,
  returnsTour,
  simulationTour,
  usersTour,
} from "./tours/pages"
import type { TourRoleInput } from "./types"

/** Registry pusat — semua tour didaftarkan di sini */
const tours: readonly TourConfig[] = Object.freeze([
  dashboardTour,
  simulationTour,
  movementsTour,
  newMovementTour,
  returnsTour,
  returnInspectionTour,
  promoRulesTour,
  opnameTour,
  dailyReconciliationTour,
  reconciliationReportTour,
  productsTour,
  bundlesTour,
  referenceDataTour,
  usersTour,
  profileTour,
])

function normalizePathname(pathname: string | null | undefined): string | null {
  if (typeof pathname !== "string") return null
  const withoutQuery = pathname.split(/[?#]/, 1)[0]
  const normalized = withoutQuery.replace(/\/+$/, "")
  return normalized || "/"
}

function matchesRoute(pathname: string, route: string): boolean {
  const pathSegments = pathname.split("/").filter(Boolean)
  const routeSegments = normalizePathname(route)?.split("/").filter(Boolean) ?? []
  if (pathSegments.length !== routeSegments.length) return false

  return routeSegments.every((segment, index) => {
    if (segment.startsWith(":") || segment.startsWith("$")) return pathSegments[index].length > 0
    return segment === pathSegments[index]
  })
}

function hasAllowedRole(tour: TourConfig, role?: TourRoleInput): boolean {
  if (!tour.roles || tour.roles.length === 0 || role === undefined || role === null) return true
  const requestedRoles = Array.isArray(role) ? role : [role]
  if (requestedRoles.length === 0) return true
  return requestedRoles.some((requestedRole) => tour.roles?.includes(requestedRole))
}

/** Ambil tour berdasarkan route aktif, dengan pencocokan segmen yang aman. */
export function getToursForRoute(
  pathname: string | null | undefined,
  role?: TourRoleInput,
): TourConfig[] {
  const normalizedPathname = normalizePathname(pathname)
  if (!normalizedPathname) return []

  return tours.filter((tour) => matchesRoute(normalizedPathname, tour.route) && hasAllowedRole(tour, role))
}

/** Ambil tour by ID, atau undefined jika ID tidak terdaftar atau role tidak diizinkan. */
export function getTourById(id: string | null | undefined, role?: TourRoleInput): TourConfig | undefined {
  if (!id) return undefined
  const tour = tours.find((candidate) => candidate.id === id)
  return tour && hasAllowedRole(tour, role) ? tour : undefined
}

/** Daftar semua tour yang tersedia untuk role tertentu. */
export function getAllTours(role?: TourRoleInput): TourConfig[] {
  return tours.filter((tour) => hasAllowedRole(tour, role))
}

/** Snapshot registry untuk menu/help atau tooling tanpa membuka array internal. */
export function getRegisteredTours(): TourConfig[] {
  return [...tours]
}
