// UI-only hints read from the JWT payload. The backend always re-checks permissions.
export function tokenPayload(token: string): { role?: string; userId?: string } {
  try {
    const payload = token.split(".")[1] ?? "";
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return {};
  }
}

export const roleOf = (token: string) => tokenPayload(token).role ?? "";
export const userIdOf = (token: string) => tokenPayload(token).userId ?? "";

export const isAdminRole = (role: string) => role === "ADMIN" || role === "SUPERADMIN";
