# HumorLLM ownership guide — author audit

Author-facing provenance and verification record for `ownership-guide.html`, prepared October 16, 2026. This is not the learner's reading path.

## Scope and source inventory

The learner requested full understanding of the full plan and smaller MVP: rationale, why the methods might work, implementation, and project ownership. The guide covers those plans and the checked-in product, rather than implementing the deferred research system. Priority: mechanisms, request/data boundaries, experimental interpretation, and actionable implementation decisions. Basic Python/JavaScript familiarity is assumed; humor, retrieval, and database authorization terms are introduced locally.

Repository inspected at `13edf43fd3a5de69f6f2e3d07724d5fa86286bf6`. Working tree was clean before guide creation. No application code, schema, credentials, live records, or deployments changed during this task.

| Source | Span / read status | Role |
| --- | --- | --- |
| `../project/humorllm-implementation-plan.md` relative to repository root | All 301 lines, sections 1–10, tables, Mermaid architecture, proposed file tree | Full scope, hypotheses, source inventory, stages, budgets, pilots, evaluation |
| `../project/humorllm-mvp-implementation-plan.md` | All 205 lines, sections 1–10, pipeline diagram, tables | Immediate paired-caption scope and acceptance |
| `../project/README.md` | Complete | Full/MVP and consumer/admin/prompt-tool boundaries |
| Repository `README.md`, `AGENTS.md`, `package.json`, `next.config.ts` | Complete | Implemented behavior, pinned versions, transport/runtime settings |
| `lib/humor/{prompts,schemas,pipeline,data,upload-image}.ts` | Complete | Actual prompt contracts, parsing, provider interface, concurrency/retries, feed and byte preparation |
| `lib/gallery-image.ts`, `lib/auth.ts`, `app/auth/callback/route.ts` | Complete | Server sanitation, verified auth, safe returns |
| `app/upload/upload-form.tsx`, `app/humor/{actions,run-progress,vote-panel,comparison-body,comparison-card}` | Complete | Active upload/generation/vote/UI path |
| `app/api/humor/runs/[id]/{route.ts,generate/route.ts}`, `app/{page.tsx,runs/[id]/page.tsx}` | Complete | Authorization, ownership, no-store responses, public/owner rendering |
| `app/upload/actions.ts` | Complete | Identified as preserved food upload; excluded from the active HumorLLM trace |
| Three `20261016*` HumorLLM migrations | Complete | Initial functions and constraints, example quota update, latest metadata and method-reveal replacements |
| `supabase/tests/humorllm.sql`, `tests/humor.test.mjs` | Complete | Access and pipeline regression definitions; distinguish definitions from executed SQL |
| `data/humor_examples.json` | Complete | Six recorded starter source/run entries; no claim of fresh production readback |
| Study-guide `SKILL.md` and `references/guide-contract.md` | Complete | Teaching, coverage, interaction, fallback, practice, QA requirements |
| Memory registry HumorLLM entry | Lines 1–44 | Located prior project and upload/vote boundaries; implementation claims were then checked against current files |

The supplied plan files are outside the Git implementation repository in the adjacent course `project/` folder. Their diagrams are text Mermaid definitions and were read in full. The guide reconstructs the pipeline relationships without needing external rendering.

## Primary-source verification

Primary sources consulted on this turn:

- HOMER paper, method sections 2.1–2.3 and evaluation sections 3.1–3.3: <https://arxiv.org/html/2602.06423v2>. Checked roles, association structure, pruning equations, pass@k interpretation, fallible evaluator, and scope of reported cartoon evaluation. The guide does not carry over headline improvement percentages or imply that they transfer to Gemini/the product.
- Pinned release `imaginator.py`: <https://raw.githubusercontent.com/Shang-hub/HOMER-Official-Implementation/d1334f295cc1a8f8f6dc67ba7e846c5939dddcec/imaginator.py>. Confirmed substring-first retrieval, query-fit TF-IDF fallback, two association views, merge, and root-to-association graph.
- Official repository overview: <https://github.com/Shang-hub/HOMER-Official-Implementation>.
- Supabase hybrid search: <https://supabase.com/docs/guides/ai/hybrid-search>. Checked rank fusion and lexical/vector roles. RRF toy ranks are manually assigned, not model outputs.
- Supabase RLS: <https://supabase.com/docs/guides/database/postgres/row-level-security>. Checked the distinction between grants and row policies. Also opened the current changelog index at <https://supabase.com/changelog.md>; no Supabase implementation changes were made.
- Gemini Interactions overview: <https://ai.google.dev/gemini-api/docs/interactions-overview>. Code remains the evidence for the installed request shape, fixed model ID, `store:false`, schema and token configuration. No claim of current account access.
- CleanComedy source overview: <https://github.com/gorovuha/CleanComedy>. Counts, label caution and other dataset-specific audit findings are explicitly described as plan-derived, not fresh dataset counts.

Limitations: web fetches of pinned release `generator.py` and `extractor.py` and the paper's framework image failed. Their call-count and text-handling differences are taken from the supplied full plan's recorded audit rather than claimed as freshly verified. Paper method text and local Mermaid diagrams establish the relationships taught here. No unread image is necessary to understand a lesson or answer an exercise. No datasets were downloaded or re-counted; no license/allowed-use qualification was completed. The guide keeps unresolved source-use decisions explicit and does not claim that code licenses settle image rights.

The guide intentionally omits citation machinery as specified by the study-guide skill. HOMER is named as the originating method. Provenance is retained here.

## Coverage map

“Covered” means the selected teaching depth is present and source-checked; it does not mean the underlying planned feature has been built or qualified.

| Topic / skill | Source location | Guide destination and representation | Verification / status |
| --- | --- | --- | --- |
| Product rationale, scripts/opposition, grounding, analogy, limits | Full §1/4, MVP §1/4, paper §2 | `#start`: visual sleeping-cat example; four caption cases; local recall | Covered; authored captions clearly labeled |
| Implemented MVP versus full retrieval and reference modes | Both plans §1; repository README | `#start`, `#retrieval`, `#roadmap`: explicit scope comparison | Covered; no current RAG/training claim |
| Actual prompt contracts, neutral metadata, audience and caption constraints | prompts/schemas, MVP §4, metadata migration | `#mvp`: contracts table, representative abbreviated JSON | Covered; hard parser vs soft style guidance distinguished |
| Concurrent branches and dependent candidate call | pipeline, MVP §4 | `#mvp`: two lanes and five-state trace; complete static trace | Covered; normal 3 calls, shared extra attempt, ideal latency recomputed |
| Candidate references, normalization, diversity and self-selection limits | schemas/pipeline/tests | `#mvp`, practice 3 | Covered; valid ID is not visual proof; unique strings are not distinct mechanisms |
| Retry/time/duplicate/provider failure boundaries | pipeline, route, SQL claim/retry | `#mvp`, `#implementation` | Covered; 90s pipeline/45s call/105s DB/120s route declaration differentiated |
| Browser preparation, transport rejection, server decode, provider sizing | upload-image/gallery-image/next.config/route | `#implementation`, practice 2, 413 recall | Covered; source ≤50 MiB, transport ≤2 MiB, long-side 1600, 20MP decoder, server 2000 box, provider 1200 box |
| Verified auth, profile, public sharing, safe OAuth return | auth/callback/upload UI/action | `#implementation`: request sequence and auth detail | Covered; no live sign-in claim |
| Run creation, storage compensation, idempotency, claims, attempt tokens | action + migrations | `#implementation`: state diagram and procedural trace | Covered; separate object/database transaction boundary retained |
| Scoped writer key versus proposed service role; quotas | README + claim/config/new-run migrations | `#implementation` detail | Covered; actual hash credential/session approach takes precedence over draft |
| Atomic metadata/pair/mapping publication and immutable ready pair | finish + trigger migrations | `#implementation` | Covered; retry creates a new run, no stored interrupted state |
| Feed pagination, history, ready/owner visibility, API/cache paths | data/pages/route, MVP §2/6 | `#implementation`, `#vote` | Covered; offset implementation distinguished from proposed cursor pagination |
| Final first vote, own-row RLS, aggregate privilege and per-run eligibility | vote/poll migrations, SQL fixture, UI/data | `#vote`: data table and synthetic voting state model | Covered; failed save, replay, other votes, sign-out/re-entry demonstrated |
| Public bucket versus private-until-published ambition | initial migration, full §5 | `#vote` storage note | Covered; public object URL is not described as private upload |
| Why situation/mechanism retrieval might help | Full §4 | `#retrieval`: cat→workplace→attendance path | Covered; mechanism adaptation versus copying/unseen premise explained |
| Lexical/dense/embedding roles, two fields and encoder consistency | Full §3/4; Supabase docs | `#retrieval`: local definitions and formula | Covered; no claim of actual embedding/index execution |
| RRF formula, missing-list contribution, rank fusion | Full §4; Supabase docs | `#retrieval`: three-channel-mode toy tool and static numeric state | Covered; values independently recomputed |
| Filters before top-k, exact scans, HNSW recall/underfill | Full §4/6 | `#retrieval`, P4 roadmap | Covered; approximate indexing remains conditional |
| Seven full calls, bounded paths/hits/context/retries, typed records | Full §4/5 | `#retrieval` numbered process; `#roadmap` worker/package | Covered; 2×(1+3)=8 queries and 40→20 cap reconciled |
| Paper/release/product pruning and compatibility differences | Full §1/4, paper/release | `#retrieval` optional reference detail | Covered; formula and heuristic limitation retained; unrechecked call count attributed to planning audit |
| Corpus provenance, counts, annotations, rights boundaries | Full §1/2/4 | `#data`: source table and record/split model | Covered; historical audit counts labeled, allowed-use qualification unresolved |
| All named source roles (CleanComedy, HOMER, New Yorker, HIC, MemeCap, Open Images) | Full §2 | `#data` table | Covered at recognition/decision depth; no new ingestion/publication |
| Duplicates, contest groups, official/train/dev/test pools, overlays | Full §2/4/7 | `#data`, recall and pool detail | Covered; foundation-model pretraining uncertainty retained |
| Vector memory and database capacity | Full §4 | `#data` worked storage detail | Covered; decimal MB vs MiB labeled; overhead excluded explicitly |
| B0/B1/H1/H2/S1, common selector, matched budget, component ablations | Full §7; MVP §10 | `#evaluation` table; practice 4 | Covered; extra compute/selection confound explicit |
| Human humor/relevance/usability, tie/neither, audience/order | Full §7; MVP §10 | `#evaluation` and rating-set tool | Covered; neither can hide poor usability despite >.5 relative preference |
| Confidence, cluster bootstrap, proposed gates/sample limitations | Full §7 | `#evaluation`, practice 5 | Covered; no manufactured interval or release result |
| Judgment counts, pass@k versus delivered selection, model judge limits | Full §6/7, paper §3 | `#evaluation` optional details | Covered; 360/882/.4/.9 calculations checked |
| Worker leases/checkpoints/resume/ambiguous provider outcomes | Full §3/5 | `#roadmap`: durable flow and practice 6 | Covered; future architecture explicitly labeled |
| Full schema/package/config/versioning and preserve existing data | Full §5/9 | `#roadmap` package/schema prose | Covered; proposed tree is not current code |
| P0–P8 and proposed technical/quality gates | Full §6 | `#roadmap` pilot table and prose | Covered; targets remain unmeasured |
| Optional API qualification, Colab/L4, quantization and failure boundaries | Full §3/8 | `#roadmap` optional resource detail | Covered; no GPU/model calls launched |
| Optional preference data, simple selector, LoRA, group splits | Full §8 | `#roadmap` optional training detail | Covered; candidate quality precedes ranking |
| Budget reservation, proposed caps, estimate scopes, live evidence and course rubric/API boundary | Both plans §8–10; full §9 | `#roadmap` cost/acceptance detail and evidence note | Covered; no spending/deployment/endpoint-compliance claim |
| Upload/UI/poll/product rendering considerations | MVP §2/3/7/9 | `#implementation`, `#vote`, code map and acceptance detail | Covered at implementation rationale depth; guide is not a separate product-design specification |
| Recall/application/diagnosis/transfer and readiness | User goal; skill contract | Local checks in §§1–7, six full practice items, separated hints/answers, return practice | Covered; no automated free-text mastery scoring |

## Verification log

- Ran the installed project's existing Node test suite with the bundled Node runtime: **26 passed, 0 failed**. Nonblocking module-type warnings appeared. These tests include fixtures rather than live Gemini requests. No new app feature tests or build were needed for documentation-only changes.
- Read SQL fixture definitions; did **not** execute them against a live database or claim fresh RLS/production validation.
- Final browser QA passed in installed Chrome **155.0.8059.80** at **1440, 768, and 375 pixels**. Checked all nine sections, all five demonstrations, all **39 disclosures**, each navigation anchor, select cases, trace boundaries/back/reset, failed vote saves, A/B choices, duplicate requests, refreshed counts, sign-out/re-entry, and every reset. Keyboard checks exercised the skip link, select control, buttons, summaries, and visible focus. No page errors or external resource requests occurred.
- Verified JavaScript-disabled offline mobile reading and native disclosures, print static example states, and answer visibility when printing with JavaScript disabled. Print was inspected through browser media rendering; no PDF was requested or generated. Reduced-motion preference was enabled; no automatic animation exists.
- Desktop and mobile screenshots of every section were generated; inspected the visual hierarchy, example diagram, flows, controls, text, equations, tables, practice and print/no-script states. Narrow tables were revised into labeled stacked fields after visual review, then the full browser checks were rerun. No page-wide horizontal overflow or clipped prose remained. Browser QA script, JSON report, and screenshots are ephemeral at `/private/tmp/humorllm-guide-qa/`.
- Independently recomputed RRF `0.038838612368024134`, preference `0.75`, neither-heavy preference `0.55`, pass@3 `0.9`, raw vector sizes `61,440,000` / `273,285,120` bytes, and the pruning example `0.8634295853251327`. Worked 360/882 judgment counts and the 1600×1200 image resize were also checked.
- Source text, authored examples, status boundaries, answer reasoning, terminology introductions, print/no-script states, and topic mapping were audited against both full plans.
- App rendering/deployment, dataset qualification, provider account access, research quality, and participant learning outcomes remain unperformed; the learner-facing evidence note states this.

## Pedagogical review

Opening action needs only the supplied picture and two captions. Main path connects a comic mechanism to generation, request reliability, voting, retrieval, data, evaluation, and next implementation. Supporting operational/reproduction details use disclosures. All code fixtures declare their abbreviated or proposed status. No external source is necessary to understand an example or solve practice. Scratch notes are intentionally unsaved; no telemetry, API, hosting, reminder, or progress/mastery claim is added.

Use this guide as a current-code explanation plus a plan explanation. Future application or prompt changes should update the snapshot and any affected examples before presenting it as current.
