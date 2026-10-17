# HumorLLM development checkpoint — October 16, 2026

Latest pipeline work: [source-to-caption handoff audit](source-caption-handoff.md).


Latest corpus work is recorded in the [reviewed corpus and image rerun](reviewed-corpus-rerun.md): 480 new records imported, with 1,003 active research examples. Earlier work is recorded in the [coverage and ranking audit](retrieval-ranking-audit.md). This earlier checkpoint and its measurements are preserved.

The Python HOMER-inspired pipeline and opt-in app/worker integration are implemented. The authorized Supabase migration is applied and 528 research candidates are imported. Default app generation remains the existing MVP; public worker generation and corpus approval remain disabled. No deployment was performed.

## Measured evidence

| Retrieval method | AI hit@5 | Precision@5 | Pooled nDCG@5 |
|---|---:|---:|---:|
| Release lexical reference | 48% | 11.6% | 0.389 |
| Full-joke dense | 72% | 21.6% | 0.567 |
| Local hybrid | 72% | 23.6% | 0.633 |

This frozen test used 50 synthetic text queries and 598 pooled query/joke pairs. Gemini judged method-hidden packets; the query author knew the corpus. The 80% AI-triage target was missed. A separate AI coordinator audit agreed on 27/30 stratified pairs and lowered three usable labels to weak; it is not representative human accuracy. Original labels and all failed cases are preserved. Supabase dense top-five ordering matches local retrieval on all 50 queries. SQL hybrid uses a different lexical scorer and has only functional checks, not transferred hybrid quality scores.

| Private ten-image experiment | Ready | Degraded | Failed | Model attempts | Median run time |
|---|---:|---:|---:|---:|---:|
| homer-dev-v2 | 3 | 6 | 1 | 82 | 17.47s |
| homer-hybrid-dev-v3 | 9 | 1 | 0 | 80 | 16.15s |
| homer-supabase-dev-v4 | 7 | 3 | 0 | 81 | 18.14s |

These are development executions on the same ten training cartoons. Ready means the technical pipeline retained an acceptable distinct caption with selected retrieval evidence; it does not measure human humor or grounding. Degraded results publish no guided pair. The hybrid experiment also changed judgment parsing, so these rows are not a controlled retriever ablation. The final Supabase run uses the corrected dense-query policy and final recovery code. Earlier dense results were **3 ready, 6 degraded, 1 failed**; an earlier progress message miscounted them.

Estimated API usage across retrieval judging and all development calls is **$0.270395 of the authorized $25**, including unknown calls held at their reservation. This is not an invoice. No further calls are needed to reproduce completed run IDs with matching fingerprints.

## Implementation and verification

The pipeline now performs visible scene extraction, conflict interpretation, independent image/description associations, bounded graph/retrieval construction, path selection, five-candidate generation, and rejection/ranking. Its direct baseline stays independent. Exact CPU embeddings are pinned. Successful stages, prompts, usage, source IDs, output hashes, failures, and cost reservations are retained privately. Persistent attempts cap at ten; unsafe, unsupported, or copied candidates are rejected individually.

The app has opt-in worker dispatch and owner-only automatic progress polling. The worker uses separate capability credentials, leased claims, durable checkpoints, shared attempt/cost limits, and atomic A/B publication. Existing vote-gated method revelation and pair immutability are preserved.

Verification passed: 22 Python tests; 28 Node tests including an isolated PostgreSQL migration test with twenty jobs and five logical workers; lint; TypeScript; production build; desktop/mobile anonymous browser checks with zero page errors and 401 denials for protected APIs. The isolated database serializes connections, so real concurrent contention is unproven. Browser queue → worker → publication for an authenticated user, live process-kill recovery, and deployment remain untested while the research release gate is closed.

Before/after ordered hashes matched for all existing public data: 24 runs, 14 images, and 12 votes. The security advisor shows intentional private-table RLS-without-policy notices and the pre-existing account password-protection warning; see [operations](operations.md).

## Remaining gates

Do not expand to 10,000 or activate public generation from these metrics. Improve retrieval, resolve source eligibility and held-out overlap, perform independent human humor/relevance/usability review, and then test deployment recovery and the authenticated product flow. No human preference gain or HOMER reproduction is claimed.

Read [operations](operations.md), [compatibility](compatibility.md), and [machine-readable results](development-results.json). The private, ignored `.local/humorllm/development-report.html` displays the ten latest images/caption pairs and links to traces. The ownership guide remains a historical explanation of the original app and full plan; this checkpoint records subsequent implementation.
