/** Public family portal origin (Vite default 5173 locally). */

export function familyPortalBaseUrl(): string {
  const raw = process.env.FAMILY_PORTAL_BASE_URL?.trim() || "http://localhost:5173";
  return raw.replace(/\/+$/, "");
}

export function buildFamilyStatusUrl(familyToken: string): string {
  return `${familyPortalBaseUrl()}/f/${encodeURIComponent(familyToken)}`;
}
