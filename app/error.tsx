"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main-content" className="site-shell account-main"><h1 className="account-title">A little hiccup.</h1><p className="account-copy" role="alert">This page could not be loaded. Please try again.</p><button className="primary-button" onClick={reset}>Try again</button></main>;
}
