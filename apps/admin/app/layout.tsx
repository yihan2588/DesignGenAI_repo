import type { Metadata } from "next";
import "./admin.css";
export const metadata: Metadata = { title: "FunnyLLM — Admin", description: "Gallery curation and Funny Lab operations", robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a>{children}</body></html>; }
