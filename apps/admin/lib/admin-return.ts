export function adminReturn(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/admin") || /[\\\u0000-\u0020]/.test(value)) return "/admin";
  try {
    const url = new URL(value, "https://admin.invalid");
    if (url.origin !== "https://admin.invalid" || !/^\/admin(?:\/(?:content|library|activity|workflow|examples|people))?$/.test(url.pathname)) return "/admin";
    const next = new URLSearchParams();
    const newImage = url.searchParams.get("new");
    if (url.pathname === "/admin/library" && newImage === "1") next.set("new", "1");
    const q = url.searchParams.get("q"), page = url.searchParams.get("page"), id = url.searchParams.get("id"), tab = url.searchParams.get("tab");
    if (q) next.set("q", q.slice(0, 120));
    if (page && /^\d{1,4}$/.test(page)) next.set("page", page);
    if (id && /^[a-f0-9-]{36}$/i.test(id)) next.set("id", id);
    if (tab && ["posts", "reports", "downloads"].includes(tab)) next.set("tab", tab);
    return url.pathname + (next.size ? `?${next}` : "");
  } catch { return "/admin"; }
}
