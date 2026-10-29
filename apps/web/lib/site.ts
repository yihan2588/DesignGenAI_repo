export const adminOrigin = "https://funnyllm-admin.vercel.app";
export const siteOrigin = "https://funnyllm.vercel.app";
const legacyOrigin = "https://design-gen-ai-repo.vercel.app";

// Complete old PKCE callbacks on the host that owns their verifier cookie.
// Existing API calls and form submissions must also stay on their original host.
export function legacyPageRedirect(origin: string, pathname: string, search: string, method: string): URL | null {
  if (origin !== legacyOrigin || !["GET", "HEAD"].includes(method)) return null;
  if (pathname === "/auth/callback" || pathname.startsWith("/auth/callback/") || pathname === "/api" || pathname.startsWith("/api/")) return null;
  const destination = new URL(siteOrigin);
  destination.pathname = pathname;
  destination.search = search;
  return destination;
}
