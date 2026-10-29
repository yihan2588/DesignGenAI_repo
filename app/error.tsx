"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) { return <section className="section-block error-state"><h1>This view could not load.</h1><p>Your saved data is unchanged. Try loading this view again.</p><button className="button primary" onClick={reset}>Try again</button><Link href="/admin">Back to overview</Link></section>; }
