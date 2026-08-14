// Single role: Admin — selalu admin
export function useCurrentRole() {
  return { role: "admin" as const, loading: false, isAdmin: true, isManager: true };
}
