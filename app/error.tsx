"use client";
import Link from "next/link";
export default function ErrorPage({error, reset}: {error: Error; reset: () => void}) {
  const staleBuild = /ChunkLoadError|Loading chunk|dynamically imported module/i.test(error?.name + " " + error?.message);
  return <main className="account-card" id="main-content">
    <p className="eyebrow">HUMORLLM</p>
    <h1>{staleBuild ? "A newer version is ready." : "We couldn’t load this page."}</h1>
    <p>{staleBuild ? "Reload to pick up the latest app files. Your saved runs and votes are safe." : "Your saved runs and votes are still in your account. Please try again."}</p>
    <button className="primary-button" onClick={staleBuild ? () => window.location.reload() : reset}>{staleBuild ? "Reload latest version" : "Try again"}</button>
    <p><Link href="/">Back to home →</Link></p>
  </main>;
}
