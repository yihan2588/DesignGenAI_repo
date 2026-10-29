import Link from "next/link";
export function PageHeading({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) { return <header className="page-heading"><div><h1>{title}</h1><p>{children}</p></div>{action}</header>; }
export function Search({ q, placeholder = "Search", extra }: { q: string; placeholder?: string; extra?: Record<string, string> }) { return <form className="filter-bar" method="get"><label className="sr-only" htmlFor="admin-search">{placeholder}</label><input id="admin-search" name="q" type="search" defaultValue={q} placeholder={placeholder} maxLength={120} />{Object.entries(extra ?? {}).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}<button className="button" type="submit">Search</button>{q && <Link href="?" className="text-link">Clear</Link>}</form>; }
export function Pagination({ base, page, more, q = "", tab }: { base: string; page: number; more: boolean; q?: string; tab?: string }) {
  const href = (n: number) => { const search = new URLSearchParams({ page: String(n) }); if (q) search.set("q", q); if (tab) search.set("tab", tab); return `${base}?${search}`; };
  if (page === 1 && !more) return null;
  return <nav className="pagination" aria-label="Result pages">{page > 1 ? <Link className="button" href={href(page - 1)}>Previous</Link> : <span />}<span>Page {page}</span>{more ? <Link className="button" href={href(page + 1)}>Next</Link> : <span />}</nav>;
}
export function Empty({ children }: { children: React.ReactNode }) { return <p className="empty-state">{children}</p>; }
export function Status({ value }: { value: string }) { return <span className={`status status-${value}`}>{value.replaceAll("_", " ")}</span>; }
