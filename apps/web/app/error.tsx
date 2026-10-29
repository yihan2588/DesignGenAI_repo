"use client";
import Link from "next/link";
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  const staleBuild = /ChunkLoadError|Loading chunk|dynamically imported module/i.test(error?.name + " " + error?.message);
  return <div className="cw-app"><main className="funny-empty" id="main-content"><h1>{staleBuild ? "A newer version is ready." : "We couldn’t load this page."}</h1><p>{staleBuild ? "Reload to pick up the latest app. Your saved creations are safe." : "Your saved creations are still in your account. Please try again."}</p><button className="cw-primary" onClick={staleBuild ? () => window.location.reload() : reset}>{staleBuild ? "Reload latest version" : "Try again"}</button><p><Link className="cw-link" href="/">Back to the gallery</Link></p></main></div>;
}
