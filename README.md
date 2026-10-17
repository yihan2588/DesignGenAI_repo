# HumorLLM

A blind, paired image-caption comparison app built with Next.js, Google Gemini, and Supabase. Visitors browse real example runs and community uploads. Signed-in users upload images, choose their preferred caption, and unlock the current poll and caption-method labels only after their vote has been saved.

Production: https://design-gen-ai-repo.vercel.app

## Understand the project

Open the offline [project ownership guide](docs/humorllm/ownership-guide.html) to learn the humor rationale, trace the current implementation, explore generation/voting/retrieval examples, and work through the full project's data and evaluation design. It distinguishes checked-in behavior from planned work and includes practice with separate hints and answers.

## Default MVP caption generation

Both approaches receive the same image and use Gemini 3.1 Flash-Lite:

- **Baseline:** one simple caption prompt, independent of the guided pipeline.
- **HOMER-inspired:** analyze visible facts and conflicting situations, explore three humor angles, generate three grounded candidates, and select one. Planning and candidate selection use two calls; the independent baseline runs in parallel.

The image-analysis call also generates a neutral short title and accessible description. Users only select an image and confirm public sharing. Validated metadata and both captions are saved in one transaction before publication; failed runs retain their saved image for retry. Existing comparisons keep their earlier metadata.

The default app path remains the small prompt chain. An opt-in Python retrieval pipeline is now implemented separately; see [development status](docs/humorllm/development-status.md). Its Supabase schema and 528-entry private research library are installed, while public worker activation remains disabled pending quality and source-use qualification. No deployment has switched the app to the worker. Public A/B positions are randomized once per run. The method mapping is returned only to accounts that have voted on that comparison; full generation traces remain private. No superiority claim is made from example outputs.

The separate [research annotation workflow](services/humorllm/README.md) has processed a 200-entry pilot followed by 800 additional CleanComedy entries with GPT-6 Luna workers. Its [audit summary](docs/humorllm/annotation-results.json) records review scope and limitations. Source text and the searchable report remain local and gitignored. The 528 inclusion candidates are embedded and imported into a private Supabase library. In the initial grading round on 50 synthetic queries, AI-graded hit@5 reached 72%, below the 80% development target. The follow-up ranking audit below preserves that result and adds paired reruns. This has not established human relevance or humor quality.

The follow-up [coverage and ranking audit](docs/humorllm/retrieval-ranking-audit.md) diagnoses the misses, documents the opt-in ranking fix, and reports paired reruns separately from the historical 72% result.

## Data and access

`humor_images` stores image metadata; the public `humor-images` bucket stores sanitized JPEGs. `humor_runs` stores immutable caption pairs and completion state. `humor_votes` stores one final choice per account and run. Private tables contain the prompt chain, usage, selected candidate, and method mapping.

Supabase RLS, table grants, and transactional RPC functions enforce ownership and voting. Aggregate counts and the method mapping cannot be read by anonymous users or authenticated nonvoters, even through direct API calls. Votes are idempotent: repeat submissions retain the first choice. No optimistic poll or method labels are shown before the database confirms the vote.

Generation needs both the user's verified session and a server-only `HUMOR_WRITER_KEY`. The database stores only its SHA-256 hash. This narrowly scoped key authorizes generation RPCs for the signed-in owner's run; it is not a service-role key. Browser clients cannot write captions or traces directly.

Each run allows three normal Gemini calls and at most one repair call, with a 90-second pipeline deadline. Quotas: one upload/retry per 30 seconds, ten non-example runs per rolling 24 hours per account, and 100 claimed generation runs per rolling 24 hours for the project. Failed runs remain visible to their owner; retry creates a new run without rewriting earlier comparisons. Generation is request-bound, so an interrupted request may require an explicit retry.

## Local development

Use Node.js 22.18+ (production uses Node 24), pnpm, and the exact dependency versions in the lockfile.

1. Copy `.env.example` to ignored `.env.local`.
2. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, and `HUMOR_WRITER_KEY` on the server only.
3. Install with `pnpm install --frozen-lockfile`; run `pnpm dev`.
4. Run `pnpm test`, `pnpm lint`, and `pnpm build`.

The migrations are incremental on the existing course database. Apply all files in `supabase/migrations` in timestamp order, including `20261016044150_reveal_caption_methods_and_generate_metadata.sql`. Only administrators can flag starter examples, and those do not consume the member allowance. Generate a random 32-byte writer key, set the same secret in Vercel and local environments, then initialize `private.humor_config.writer_key_sha256` to its hex SHA-256 digest through an administrative database connection. Do not commit the key or place it in a `NEXT_PUBLIC_` variable.

`supabase/tests/humorllm.sql` tests owner access, anonymous/nonvoter restrictions, two independent voters, duplicate submissions, generation claims, and immutable publication. Run through an administrative SQL connection; its synthetic accounts, configuration, and data roll back.

## Deployment and review

The existing Vercel project deploys `main`. Production requires all four environment variables above. Google OAuth remains configured through Supabase, using the existing `/auth/callback` redirect. Login returns users to their intended comparison or upload page; upload requires a completed profile. Public galleries remain available after logout.

Verify in production: image-only upload → generated title, description and both captions → no counts or methods before voting → persisted choice, counts and correct method labels after voting → reload → logout → protected-route redirect → login → saved choice and labels restored. Also check mobile layout and anonymous API denial. Example images and credits are recorded in `data/humor_examples.json`; example captions must be generated by the real app, never manually fabricated.

The previous food project documentation is preserved in [docs/at-the-table-history.md](docs/at-the-table-history.md). Its records are retained in Supabase, while HumorLLM is the active product. Public post deletion/moderation remains outside this course MVP. The opt-in research worker adds durable jobs without changing default generation.


The latest [launch-readiness assessment](docs/humorllm/online-readiness.md) covers the source-free HOMER-inspired fallback, current local verification, and the remaining hosted-worker/source-approval release blockers. The fallback is recorded privately as a separate mode, so its votes cannot be mistaken for evidence of successful RAG transfer.
