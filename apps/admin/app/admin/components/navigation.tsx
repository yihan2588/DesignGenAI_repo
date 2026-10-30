"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const destinations = [["/admin", "Overview"], ["/admin/content", "Content"], ["/admin/library", "Image library"], ["/admin/activity", "Activity"], ["/admin/workflow", "Workflow"], ["/admin/people", "People & access"]] as const;
export function AdminNavigation() { const path = usePathname(); return <nav className="admin-nav" aria-label="Administration">{destinations.map(([href, label]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>{label}</Link>)}</nav>; }
