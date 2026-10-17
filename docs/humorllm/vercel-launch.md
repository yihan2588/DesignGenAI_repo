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
- Hosted build and authenticated browser verification are in progress. Production is not switched based on these local checks.
