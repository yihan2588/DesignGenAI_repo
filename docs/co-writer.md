# FunnyLLM co-writer: implementation and engineering decisions

Status: implemented on 29 October 2026. This document describes the shipped code, not a claim that its jokes beat a baseline.

## Product contract

The home screen has two starting points. **I have a pic** keeps a private upload fixed and accepts an optional comic spirit. **I have a thought** retrieves images and returns three complete image–caption options before offering image swaps. A valid partial result is shown with an explicit notice when fewer than three options survive validation. Failure preserves the previous draft; it does not invent a third caption.

Users can select a take, request Shorter / Less obvious / Less mean / Different angle, manually edit, undo, save a preference, or export a captioned PNG. Image swaps adapt the caption to a chosen image in the same shortlist. These are different operations with different invariants. Quoted phrases in the constraints field are exact locks for generated text. Manual edits give the user final control.

The previous comparison experience lives at `/compare`; existing runs, votes, configurations and the admin Prompt Lab retain their behavior. There is no self-evolving prompt process or automatic prompt promotion.

## Architecture and tool choices

| Layer | Implementation | Reason and tradeoff |
|---|---|---|
| Web app | Existing Next.js 16 / React 19 / TypeScript, Hum styling, local Chillax fonts | Reuse auth and deployment; avoid a second frontend. |
| Generation | Gemini 3.1 Flash-Lite Interactions API, `store:false`, Zod structured contracts | Existing credentials and multimodal support. Direct REST is sufficient for a bounded workflow; no agent framework or orchestration graph. |
| Retrieval | Postgres FTS + pgvector cosine, Gemini embedding-001, normalized 768 dimensions | One operational database. Exact scans are appropriate for 887 rows; introduce ANN only after measuring larger indexes. |
| Storage | Supabase private uploads; 722 sanitized teaching JPEGs deployed as content-addressed static assets | Owner access for personal images; predictable image availability and no browser CORS dependency for teaching images. Static catalog updates require redeployment and add about 65 MB to the repository. |
| State and concurrency | Postgres claim/finish RPCs, request IDs, content fingerprints, optimistic revision checks, prior snapshots | Protect against duplicate actions, race conditions and silent overwrites. Request-bound execution means interrupted operations may need an explicit retry. |
| Export | Shared layout plus Fontkit glyph outlines and Sharp | PNG lettering uses the actual bundled font, independent of host font installation. MVP supports English/Latin captions and supported punctuation, not emoji or all writing systems. |
| Observability | Versioned private request records, stage duration, provider usage, admin dashboard, pause control | Uses existing secured infrastructure. Langfuse/OpenTelemetry integration is deferred; no account or SDK integration is claimed. |
| Evaluation | Same workflow in Node, actual SQL in local PGlite/pgvector, blinded HTML reviews, Python task-cluster bootstrap | Repeatable controlled comparison without production test accounts. Human humor ratings are still needed. |

`lib/cowriter/workflow.ts` is the shared generation core. `server.ts` owns authentication, data access, deadlines, streaming and persistence. The browser cannot choose models, prompts, retrieval strategy, API destinations, catalog IDs outside a saved shortlist, or another user's image path.

## Teaching-data preparation

The supplied archive has 887 image rows. This implementation uses image URLs, factual descriptions and additional context only. It does not import profiles, individual votes, caption authors or existing captions into generation prompts.

- 884 image rows decoded successfully; 722 exact sanitized-image hashes remain after deduplication.
- 885 rows have newly generated 768-dimensional embeddings. Availability and embedding presence are separate gates; inaccessible media is excluded from retrieval.
- 142 missing descriptions were backfilled from pixels. Supplied descriptions were preserved and trusted.
- 877 rows have derived relationship labels. These are explicitly interpretations, stored separately from factual descriptions.
- Three media failures are recorded in `catalog-import-report.json`: inaccessible or undecodable media, not semantic judgments.

Preparation is resumable. The scripts bound download size and pixel count, allowlist the source hosts, reject redirects, strip metadata, normalize orientation, and hash the resulting JPEG. Exact-byte families do not guarantee perceptual duplicate removal; perceptual clustering is a future optimization.

```sh
python3 scripts/prepare-catalog.py '../funnybone-supabase-anonymized-fall-2026 .zip'
node --experimental-strip-types scripts/import-catalog.mjs
node scripts/catalog-sql.mjs
```

Review `.cowriter-cache/sql/*.sql`, then apply the DML through the Supabase connector or an authorized administrative database connection. `.cowriter-cache` and all credentials are ignored. No public import RPC or temporary privileged account is needed. `prepared` means prepared locally, not already imported into production. Preserve the JSON report and index version with each import. Existing source embeddings are not mixed with the new embedding model.

## Bounded prompts and retrieval

Picture mode sends the image and optional spirit to interpretation, then sends the image plus the compact interpretation to composition. Thought mode interprets the target and tension, embeds three query views in one batch, searches, and composes jointly over eight distinct image families. Both paths have two generation calls; thought mode adds one embedding batch and one database search. There is no default critic call or repair loop.

The three search views retain the original target, express the abstract relationship, and describe a visual analogy. Each contributes its top 20 cosine and lexical results. Reciprocal rank fusion uses `1/(60+rank)` across six ranked lists. The top 40 become an eight-family shortlist. The composer chooses the image and caption together. Retrieval rank is evidence of potential connection, not a humor score.

The writer is directed to add a voice, status claim, consequence or reversal instead of narrating the image or echoing the user's nouns. It aims for 3–10 words, with hard limits of 14 words, 90 characters and one line. It is allowed to omit incidental objects. It must retain a recoverable connection and explicit constraints. Validation rejects unknown image IDs, duplicate captions, unsupported glyphs and missed quoted locks without truncating punchlines.

These constraints prevent mechanical failures; they cannot certify humor. The development samples still contain literal restatements and familiar phrases. Prompt examples can also anchor wording. Use the error taxonomy and human review to decide the next change, rather than increasing chain depth by default.

## Latency, safety and recovery

The generation deadline is 15 seconds; the Vercel write route allows 30 seconds for auth, storage and persistence around it. NDJSON reports actual stages and only publishes complete options. After eight seconds the UI acknowledges the wait. Cancel aborts the client request and provider signal; sequence guards discard stale responses. If completion races cancellation, a saved result may be recoverable from Saved drafts. Cancellation cannot undo provider work already performed.

Each account gets 50 AI operations per rolling 24 hours; the project guard is 500. Failed attempts count. One active AI request per owner is admitted within a 25-second window. These database admission limits bound ordinary use, but the global allowance is not a billing guarantee under simultaneous admissions across different owners. Configure provider spending limits separately for broader public use. Upload insertion is capped at 100 files per owner, with 2 MB sanitized JPEGs. This is an abuse guard, not automatic retention cleanup.

All personal sessions and revisions are private. SQL checks verified identity and the existing narrow server writer key; no service-role secret enters the browser. Same-origin mutation checks, bounded request bodies, decoded image validation, strict media paths and pinned provider endpoints limit unintended input paths. Catalog images remain public teaching assets. The empty, unused `cowriter-catalog` bucket remains with no upload policies; personal uploads use `cowriter-uploads`.

Admin traces omit user text and images. Stored `elapsed_ms` measures generation work before the final database save; it excludes upload, client rendering and the final commit. The successful-draft p95 is conditional on successful runs and must be read alongside failures. It is not end-to-end perceived latency.

## Evaluation protocol

Run the development harness with the same prepared catalog:

```sh
pnpm eval:cowriter docs/evaluation/tasks.json .cowriter-cache/my-run
python3 scripts/analyze-cowriter.py .cowriter-cache/my-run reviewer-1.json reviewer-2.json
```

The thought ablation uses the same interpreted intent, writer prompt, model, output limits and number of options. Only retrieval query construction changes: literal query versus target/relationship/analogy. Picture mode compares direct composition with interpretation followed by composition. This estimates the value of the interpretation step. It is **not** an exact replay of the historical `/compare` production configuration, whose prompts and length limits differ. To claim improvement over that product, freeze its active configuration and run a separate product-level comparison, explicitly treating its different interaction and output count as part of the product change.

Every run records task, input, candidate IDs, shortlist, stage usage, model, prompt hash, catalog hash and failures. Thought timings record the shared interpretation separately. The order of system execution and A/B labels is randomized. No failed arm is silently removed. `review.html` presents complete sets, then reveals intent. Reviewers export pseudonymous ratings; `blind-key.json` stays separate until review ends. The analyzer reports raw wins, ties and neither, missing-task coverage, failures and task-cluster bootstrap intervals.

The six supplied tasks are **development smoke fixtures**: four thoughts and two variants of the same picture. They are not held-out evidence. A real pilot should use 30–50 fresh tasks per mode, several independent reviewers, held-out image families, and preregistered success criteria. Capture paired humor preference, intent preservation, at least one keepable option, time to first keep, edits to keep, failures, end-to-end p50/p95 and cost per kept meme. Do not count three captions from one request as three independent tasks. Do not tune prompts on the final holdout.

## Decisions to remember in an interview

1. **Translate demand into invariants.** “Better jokes” becomes an image/spirit contract, short outputs, diversity, user control, bounded latency, and human preference measurement. The model's self-score cannot substitute for these.
2. **Retrieve for the task.** Similar objects are often the wrong match. Multiple query views preserve target identity while finding analogous tensions. Retrieval and joke quality need separate evaluation.
3. **Make stochastic components replaceable.** A small typed workflow with injected provider/retrieval functions is easier to test and ablate than an unnecessary autonomous agent.
4. **Design failure as part of the product.** Valid partial results, private saved state, idempotency, revision checks, explicit retry and undo matter as much as happy-path generation.
5. **Measure the correct unit.** The user's request is the experimental unit. Blinding, task clustering, failure accounting and holdouts matter more than a large number of model-generated scores.
6. **Make operational tradeoffs explicit.** Exact search, static catalog media and database-native traces are deliberate small-system choices. Explain when scale or collaboration would justify ANN, object-storage delivery or an external tracing platform.

Recall practice: Why might a semantically closer image produce a worse joke? What changes in a valid retrieval ablation? Why can successful-request p95 conceal a regression? What happens if two refinements finish in the opposite order? Why is a “Keep” click not a calibrated humor label? Answer these using one actual trace and one failed example from this implementation.

## Release and rollback

Both applications share one Supabase project. The media-app repository owns the additive co-writer migrations. The live core migration is `20261029063715_funnyllm_cowriter_core`; the local source is `20261029063133_funnyllm_cowriter.sql`. A preceding live placeholder migration contains no DDL. Do not replay the core migration into an existing database or rewrite applied history. The subsequent operational-guards migration removes unused catalog import endpoints and installs upload limits.

Deploy the user app and admin from their `codex/funnyllm-cowriter` branches after checks. The admin can pause AI writing while saved drafts, manual edits and exports remain available. Rollback re-promotes the previous deployment; the additive schema and private drafts can remain. Do not run destructive down migrations as part of an app rollback.
