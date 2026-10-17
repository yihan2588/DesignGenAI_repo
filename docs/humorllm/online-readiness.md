# HumorLLM launch readiness — October 16, 2026

The fallback implementation has passed local and live model qualification. The new retrieval pipeline is **not ready to activate on the public app yet**. This is a readiness assessment and local implementation update, not a production release.

## Requested behavior

When no source-backed caption qualifies, the HOMER track now writes five fresh source-free captions and independently judges them using the verified physical scene, visual conflicts, and original independent image/description associations. These context stages precede retrieval. The fallback requests receive no retrieved examples, source plans, critiques, retrieval-derived branches or previous captions. They use the same registered Gemini Flash caption model as the baseline and normal guided writer/judge.

Safety, physical-grounding, source/OCR copying and baseline-distinctness checks still apply. A successful fallback has `status=ready`, a nonempty guided caption, `guided_mode=no_rag_fallback`, and empty selected/successful-source IDs. Its candidate/judge/filter traces are saved under `fallback`; original retrieval attempts remain available for diagnosis. RAG success remains separately marked `guided_mode=rag`. No generated output is manually selected or edited.

This avoids a user-facing “No qualifying output” state for a retrieval miss. A provider outage, exhausted budget or an entire rejected fallback batch still yields the app's retryable generation-error flow; an unchecked caption is never fabricated. The public A/B workflow and hidden method assignment are unchanged.

Nine calls remain normal, eleven when fallback is needed. The persistent limit is twelve to allow one repair/retry; the shared authorized $25 cap and 300-second invocation deadline remain. Schema repairs, crashes, unknown usage and retries preserve reservations and attempt counts. Strict research ablations explicitly disable the fallback; the app's default enables it.

## Verification

- Fifty-five Python tests pass, including source-free prompt isolation, empty corpus, normal RAG without fallback, safety rejection, fallback after schema repair, twelve-attempt bounds, and fallback resumption on a new host without repeating the writer.
- Twenty-eight JavaScript tests pass. The isolated PostgreSQL integration exercises publication of a fallback pair, private provenance, wrong-owner denial, stale-token denial, checkpoint bounds, capability checks, twelve-attempt enforcement, unknown-cost reservations, immutable pairs and persisted vote gating.
- Lint and production build pass.
- A real Chrome browser executes the app's existing `prepareUploadImage` on all four supplied original files. In particular, the Christmas-bear file is detected as MPO by Pillow; Chrome's normal app preprocessing creates a supported JPEG. Raw-file CLI failures are preserved separately and are not counted as app-path outcomes.
- The local production build renders at 1,440px and 375px without overflow or page errors. Anonymous status/generation endpoints return 401. The existing production homepage also returns 200 and rejects anonymous run requests with 401. These are not authenticated worker tests.

All four app-preprocessed photos returned complete pairs in fresh live runs:

| Photo | Guided mode | Model calls | Elapsed |
|---|---|---:|---:|
| Reaching from a sofa | RAG | 9 | 88.4 s |
| Christmas toys | Source-free fallback | 11 | 110.7 s |
| Wooden stocks | RAG | 9 | 90.4 s |
| Bear-relocation container | Source-free fallback | 11 | 120.2 s |

There were no manual labels, prompt edits, winner selections, or generation replays in these final four cases. Each original image followed the app's actual Chrome upload preparation before the normal Python sanitizer. All pipeline source files stayed unchanged during this qualification. Successful fallback requests contain no demonstrations, transfer plans or source critiques, and both fallback results have empty selected/successful-source IDs. Complete outputs and traces, checksums and browser checks are in the private `.local/humorllm/user-tests/20261016-online-readiness/` bundle.

The cumulative local ledger is $3.744931 committed or reserved against the approved $25 cap. This task added $0.8370625 including $0.30 retained reservations from sandbox-blocked network attempts. Total unknown reservations are $0.70, including $0.40 from prior work; these are not claimed as actual provider charges. An earlier raw-file diagnostic batch returned three complete pairs and rejected the MPO Christmas-bear input; it is preserved separately and excluded from the four app-path outcomes. The test uses the actual Pipeline/provider/retrieval classes and real Gemini/Supabase research retrieval, but not hosted job claiming or publication. It supplies no Codex labels, audit decisions or caption replacements. The automatic physical-scene review is an ordinary Gemini pipeline stage.

## Observed launch blockers

1. **No hosted worker.** The shared database has generation disabled and no recent or historical worker heartbeat. The Python worker needs a supervised host with its pinned dependencies, encoder weights, verified index, persistent state and scoped secrets. The Next.js deployment alone does not run this process.
2. **Research-only corpus.** All 1,003 active sources remain non-production eligible, and source/corpus approval is false. The production worker's index loader and retrieval/publication gates intentionally refuse this state. The recorded source scope says upstream per-item provenance is unresolved. This assessment does not approve sources or change their permission scope.
3. **Compatibility migration/configuration pending.** The new fallback SQL migration has passed isolated tests but is not applied live. The live worker configuration still names Flash-Lite and `full_dense`; the tested configuration is Flash 3.8 plus `balanced_rerank`. The pending migration aligns defaults only while disabled. The existing migration-history mismatch must be handled without blindly replaying old migrations.
4. **Deployed end-to-end verification outstanding.** The current production deployment is the MVP at commit `13edf43`, not this uncommitted worker implementation. An authenticated image upload → enqueue → hosted worker → two persisted captions → hidden method assignment → saved vote → revealed results test is still required against the release candidate. True concurrent worker contention and kill/restart recovery have not been verified on a hosted service.
5. **Quality evidence is developmental.** The supplied photos have been used during development. Automatic grounding/transfer admission does not establish a human humor preference improvement or a held-out retrieval score. Monitor fallback frequency separately from source-backed success when evaluating the two tracks.

## Release sequence

Resolve the production source set, provision the supervised worker, apply the tested compatibility change after reviewing migration history, package the matching production index and encoder, reconcile local spend into the remote ledger, stage the web app and worker with the tested model/retrieval configuration, and run the authenticated deployed workflow including an induced retrieval miss. Only then activate the new pipeline and validate the first real run. Existing production remains on its MVP during this assessment.
