# Vercel release candidate — October 16, 2026

The hosted release uses the existing Vercel project and Supabase project. Vercel Services and Queues are beta features. No Railway account or paid hosting upgrade is required by this configuration. Production remains on the MVP until an authenticated preview upload-to-vote check succeeds.

## Execution

The web service verifies origin, session and run ownership, enqueues a Supabase job, and publishes its UUID to `humor-generation`. Vercel invokes a private queue consumer, which calls the Python service over an internal binding with a separate worker capability. The Python service has no public rewrite. Supabase leases the specific job, stores checkpoints, reserves model costs, and atomically publishes both captions. Duplicate deliveries return a terminal receipt without generating a second pair. Active leases return a retryable response.

The pinned MPNet encoder and production index are packaged at build time. The build reads batches through a read-only capability RPC, verifies every source ID and text hash against `services/humorllm/hosted/release.json`, and downloads the pinned public encoder revision. Original jokes, embeddings, encoder weights, user photos and credentials stay out of Git. Query embeddings use ephemeral `/tmp` cache; generation recovery uses Supabase, not a local volume. The worker bounds each pipeline execution to 250 seconds within the 300-second function limit. Successful stages and the twelve-call budget survive delivery retries.

The deployed caption model remains Gemini 3.8 Flash for both tracks. Retrieval uses `balanced_rerank`; a retrieval miss invokes the independently judged source-free chain. This is recorded as `guided_mode=no_rag_fallback`, with empty successful-source IDs. It does not turn an unsafe batch or provider outage into an unchecked caption.

## Corpus and budget

The research set remains 1,003 active records. The production release selects 828 exact ID/hash pairs after excluding 175 conservatively flagged lexical overlaps with 2,297,153 available benchmark captions. A flag is not a confirmed semantic overlap, and unflagged records are not proven contamination-free. Production approval records the upstream repository's declared CC BY 4.0 license and the user-authorized public course demo. Individual source rights and human humor quality have not been independently adjudicated. Attribution appears in the privacy page.

Local API qualification is frozen at $3.744931 committed or reserved. Supabase retains this amount as `prior_spent_usd`, then adds remote call costs or unknown-call reservations against the shared $25 ceiling. This is an estimate, not an invoice; neither ledger is reset.

## Database compatibility

The fallback migration is applied remotely as `20261017003710_humor_no_rag_fallback`; the request-driven lease/export migration is `20261017005033_humor_serverless_dispatch`. Local filenames predate those application times. Earlier source-review migration filenames also differ from remote history. Use named, reviewed migrations and inspect history; do not blindly replay migrations with `db push`.

Private tables have RLS with no client policies by design and are accessed through scoped capability functions. Supabase advisors report those deny-by-default tables as informational findings. The pre-existing leaked-password warning concerns password authentication; the app's sign-in flow uses Google OAuth.

## Verification status

- 62 Python tests pass, including authenticated HTTP boundaries, body bounds, transient failures, leases, durable fallback recovery and source isolation.
- 28 JavaScript tests pass, including isolated PostgreSQL publication, wrong-owner denial, stale tokens, per-run attempts, spend reservations and persisted vote gating.
- Lint and the Next.js production build pass.
- Local build-time export, identity verification, pinned encoder download and production index load pass for all 828 sources.
- Vercel preview `dpl_JAVWAZavYs1BESXR2y7cLBEmcSke` is READY at commit `2a2c3ed`. The hosted Linux build validates all 828 source identities, packages the pinned encoder and uses the large-function beta.
- Preview homepage returns 200; anonymous run status and generation return 401; public `/work`, `/health` and the queue callback return 404. Runtime logs show no errors for those checks.
- The database permits only the operator’s two existing accounts during canary verification. Production web routing remains on MVP commit `13edf43`.
- Authenticated upload-to-vote verification is pending university SSO authorization. Selecting the existing Columbia Google account redirects to Columbia CAS; automatic approval review blocks observing that additional origin until the user authorizes it. No university credentials were read or submitted. The release is not yet approved for public activation.


## Image delivery correction

The first preview's public homepage returned 200 while its generated `/_next/image` requests returned the Next.js 404 HTML page. Browser checks confirmed `complete=true` with `naturalWidth=0`; the original Supabase asset returned 200 JPEG, and the production MVP optimizer returned 200 JPEG for the same source. The initial access checks did not verify image decoding and missed this regression.

Commit `b09868c` configures Next Image to serve already resized/re-encoded Supabase assets directly. This avoids the failing optimizer endpoint, at the cost of serving the prepared original instead of a viewport-specific transformed image. Vercel deployment `dpl_HeBpKxK4wG2BFSnMVi7s5NznFJtE` is READY. Use the branch URL `https://design-gen-ai-repo-git-humorllm-8c2fcb-yihan2588-5788s-projects.vercel.app`; the earlier immutable deployment URL still contains the old code.

The production build, lint and all 28 JavaScript tests pass. Real browser verification of the fixed local build and hosted branch found all twelve gallery images decoded after scrolling, no broken images, and no horizontal overflow. The hosted wooden-stocks detail page decoded both images at natural width 700; anonymous method/poll gating remained visible. The hosted browser error log was empty for these checks. Private receipts and screenshots are in `.local/humorllm/launch-20261016/image-*`.

This does not complete authenticated upload, queue execution, fallback publication or voting verification. Automatic approval review also rejected a fresh Google OAuth attempt because it might reach the previously unapproved Columbia CAS origin. No sign-in protection was bypassed. Production has not been switched.


## Preview authentication routing audit

The two candle runs (`41ddf52d-5b76-4e11-b172-b2ee04f4efeb` and `8783c757-b2e9-4262-9c0d-8024be088829`) store `humor-mvp-3`, Flash-Lite and only baseline/planning/candidates stages. Neither has a worker job. The preview branch environment is confirmed `HUMOR_PIPELINE_MODE=worker`.

Supabase edge logs at 2026-10-17 02:29 UTC show both the incoming browser referrer and requested `redirect_to` host were the preview branch hostname. The corresponding Auth logs selected the production hostname as the effective referrer. Supabase Auth's redirect validation falls back to Site URL when the requested callback is not allowed. This explains how preview sign-in led to production generation and why those results appeared in the shared feed. The dashboard allowlist still needs inspection and correction; the expired dashboard session prevented reading it.

The intended callback addition is exactly `https://design-gen-ai-repo-git-humorllm-8c2fcb-yihan2588-5788s-projects.vercel.app/auth/callback`, preserving the production Site URL and every existing entry. Do not add a broad wildcard or change the global Site URL. Browser approval review rejected the existing GitHub sign-in to the Supabase dashboard; authorization is required before that sign-in and the callback edit. The prior Google/Columbia CAS sign-in gate also remains unresolved.

The generation route now refuses MVP configuration in Vercel preview environments. Twenty-nine JavaScript tests, lint and the production build pass. This guard prevents a missing variable from silently replacing the new pipeline, but does not itself repair the login redirect or establish hosted generation success.
