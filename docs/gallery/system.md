# FunnyLLM gallery and operations release

29 October 2026. Product behavior and engineering evidence for the remake.

## Product

`/` is the public Funny Gallery, with eight labeled studio examples and explicit user shares. Anyone can browse; any Google account can sign in to create, react, save, remix and report. `/lab` is the two-mode co-writer. `/creations` separates private drafts, shared snapshots and saved public memes. `/meme/[id]` is a public share page while the post is published.

The funny control panel pairs Shorter/Longer, Less/More obvious and Less/More mean. Length has a strict 20-word and 200-character ceiling in model parsing, manual edits, publication and rendering. Longer must increase word count; Shorter must decrease it. A failed edit keeps the prior version, with no silent truncation. Tone/obviousness are model-directed rather than deterministic numeric measurements. Meaner retains existing safety boundaries.

## Publication and moderation

Publishing copies the image and selected caption into an immutable public snapshot. Later private edits do not alter that snapshot. An explicit author alias is public; account email, private brief, draft state and prompt traces are not. A stable storage path and unique session/revision/option tuple make publication retries idempotent.

Images live in a private `funny-gallery` bucket. Anonymous read policy requires a currently published post. Proxy routes use `no-store`. Owners can unpublish/republish; admins can feature, remove and restore. Removal resolves reports and blocks owner republication. Restoring a user post makes it unpublished until the owner chooses to publish again. Studio restoration returns the curated example to the gallery. A removed or unpublished item can still be accessed privately by its owner and admins. Previously downloaded copies cannot be revoked.

Reports are user-submitted and manually reviewed. The product does not claim automatic moderation or a human humor score. The seed script uses only teaching images and newly authored captions labeled FunnyLLM studio; it does not republish teaching profiles, votes or private drafts.

## Admin structure and access

Overview, Content, Image library, Activity, Workflow, Examples and People & access each have one operational purpose. Gallery media and request records link to generation history. Prompt chains are represented as the one source-controlled co-writer workflow and inspectable steps. Its generated manifest records source version/fingerprint. There is no mix, terms editor, signup-domain gate or fake provider configuration.

The database requires verified Google sign-in and exactly one of `yihan2588@gmail.com`, `yw4756@columbia.edu`, `hg2736@columbia.edu`. This replaces the old superadmin predicate for both old and new admin RPCs. User-editable profile fields cannot grant admin access. Users are read-only in admin; the exact allowlist is visible and changed only through a reviewed migration.

New image uploads are decoded, normalized and stripped of metadata, then stored privately in `funny-library`. Description and relationship edits regenerate the normalized 768-dimensional embedding before saving. Retiring an image removes it from new retrievals while preserving access for owned historical shortlists. Initial teaching assets remain static; new uploads do not require redeployment.

There is one Gemini adapter. Models have a registry and compatibility probe before activation. At most three enabled generation examples enter composition. Model and examples are frozen per draft so later edits use the original runtime. Changing a selected model identifier requires a different entry; selection checks the probed identifier again to reject a race. Example deletion and model retirement retain historical snapshots.

## Observability

Activity records include action/status, timing, errors, runtime, results, usage and bounded sent-prompt/parsed-response traces. Lists omit large bodies; details require admin authorization. Secrets and image bytes are excluded. Original inputs can be sensitive, so raw traces are private. No external Langfuse integration is claimed. Older requests may lack the new detailed traces.

Displayed draft compute p95 is measured over successful recent draft requests; it excludes upload, browser rendering and final save. It is not end-to-end latency. Token usage is provider-reported; no fabricated dollar cost is shown. The existing AI request allowance is not an absolute provider billing cap. Automated data-retention cleanup remains a future operation.

## Migration and retirement

Canonical files: `20261029161615_funnyllm_gallery_system.sql` and `20261029162549_funnyllm_release_guards.sql`, copied unchanged into the admin checkout. Applied to Supabase project `nqmwkajkucwfipdowvzh` as `funnyllm_gallery_system` and `funnyllm_release_guards`. Local filename times and service application times can differ.

Legacy `/compare` and run reads remain an archive. Old generation, voting and upload handlers return an archive message; legacy database function and table write privileges are revoked. Historical rows remain. Rolling back app code alone will not restore old A/B writes; do not silently restore those privileges. Keep the additive schema and use a forward fix for the new system.

## Verification

- User app: **59 tests passed**, ESLint and TypeScript passed; optimized Next.js build passed.
- Admin app: **51 tests passed**, ESLint and optimized Next.js build/TypeScript passed.
- Actual migration SQL ran in isolated PGlite with pgvector: ownership, publication snapshot, private media, moderation, runtime limits, exact Google admin access, model identifier race and historical image access were verified.
- Signed-in browser with live Supabase/Gemini: thought generation, Longer, More mean, Undo, exact 20-word manual save, 21-word rejection, sharing, Like, Save, report and PNG export passed. The existing two-mode release also exercised private picture generation and image swaps.
- Admin removal of the labeled release-check post resolved its report; its raw image returned **404 to an anonymous HTTP request** afterward.
- Admin upload of a disabled test image completed storage and indexing; description edit completed re-indexing. It remains retired and cannot enter new retrievals.
- Gallery responsive sweep: 1280/1440/1920/375 px; zero FAIL/WARN, one existing explicit control-height waiver. Authenticated app/editor captures supplement anonymous capture. Fresh-context finish review: ship; one mobile button-wrapping defect fixed and recaptured. Before screenshots were unavailable.

Production release IDs and final checks will be recorded after staging and promotion. These checks establish implementation and access contracts. They do not establish that jokes improved; blinded human preference evaluation is still pending.
