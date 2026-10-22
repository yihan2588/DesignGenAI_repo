"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="account-card" id="main-content"><p className="eyebrow">HUMORLLM</p><h1>We couldn’t load this page.</h1><p>Your saved runs and votes are still in your account. Please try again.</p><button className="primary-button" onClick={reset}>Try again</button></main>;
}
