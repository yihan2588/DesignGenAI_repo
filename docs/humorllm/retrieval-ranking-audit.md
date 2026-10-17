# Retrieval coverage and ranking audit — October 16, 2026

Later implementation: [source-to-caption handoff audit](source-caption-handoff.md). The results below preserve the earlier implementation and do not qualify the revised query/admission flow.


The main actionable problems were candidate ranking and unstable AI grading. The existing corpus contains credible examples for all three shared misses, so it was **not expanded to 3,000**. The corpus remains 528 private research records. Public worker generation is disabled; no deployment occurred.

## Coverage diagnosis

The original 28% meant 14/50 dense queries lacked an AI-grade-2 item in the top five. All queries returned five rows. Eleven of the fourteen already had an originally usable-graded record returned by another retrieval method. Dense and hybrid had different missed queries despite both scoring 72%.

For the three common misses, an exhaustive diagnostic graded all 528 current entries for each query: **1,584 query/source pairs**, with exact source coverage verified. AI-positive counts (22/33/31) are suggestions, not accepted matches. The coordinator inspected source-specific witnesses:

| Query | Existing source | Transferable relation |
|---|---|---|
| Otter holding kelp | `cc-en-18340` | Literal floating/drifting versus figurative “drifted apart” |
| Pigeon on a computer mouse | `cc-en-27748` | Treating computer activity as a mistaken physical interaction with hardware |
| Books supporting a laptop | `cc-en-12989` | Knowing information versus using knowledge practically |

These are AI interpretations, not human gold. Of 33 original query/source pairs repeated in the exhaustive diagnostic, **20 changed grade and 10 crossed the usable threshold**. This is a deliberately hard subset, not a representative judge-accuracy estimate. Examples such as “Santa pause” for an otter or a “well” pun for books illustrate overgenerous cross-domain interpretations. Raw labels, original metrics, invalid-ID attempts, and source-specific witnesses are preserved separately.

## Implemented fix

1. Preserve candidate diversity with a bounded round-robin pool from full dense, hybrid, release-reference lexical, and mechanism-focused retrieval. For one local query, the twenty-record pool retains each channel's first five before the cap. The graph also uses a bounded pool across association queries, rather than favoring sources that recur at generic nodes.
2. Give the existing merge/selector the original jokes as well as their annotations. It ranks up to five candidates by concrete scene/relationship fit and the exact lexical requirements of puns.
3. Select evidence using IDs referring to supplied verbatim source excerpts and visible-scene anchors. The code resolves those IDs into quotes; unsupported references fail validation. This removes the brittle free-form quotation task. Reference validity remains different from semantic grounding.
4. Admit only grade-2 source relations to demonstrations or retrieved paths. Weak records cannot silently become retrieval evidence. Empty admissions remain legitimate degradation. The independent baseline stays separate, and normal generation remains **eight model calls**, with the persistent ten-attempt cap.

This follows the broad [retrieve-then-rerank pattern](https://www.sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html), using the already configured Gemini model within the existing merge call. No new model download/provider or API call per association node was added. Full dense and hybrid remain available as controls. `balanced_rerank` is opt-in; the app's default mode is unchanged.

## Paired rerun — original 50 scenarios

The three original baseline methods returned exactly the same ordered top-five IDs on all fifty queries. They and the new modes were regraded together with method/rank information hidden. The historical 72% result is retained and must not be directly subtracted from this new grading round.

| Method | Hit@5 | Precision@5 | Pooled nDCG@5 |
|---|---:|---:|---:|
| release_lexical | 40% | 10.4% | 0.306 |
| full_dense | 68% | 19.2% | 0.484 |
| hybrid | 80% | 24.4% | 0.578 |
| balanced | 72% | 21.2% | 0.510 |
| balanced_rerank | 94% | 35.6% | 0.782 |

## Separate 20 development scenarios

These were frozen before implementation, but the author knew the corpus and the cases were reused while repairing the quotation contract. They are **not untouched held-out evaluation**. Two deliberately low-evidence scenes remain in the all-twenty denominator; no cases were removed after seeing results.

| Method | Hit@5 | Precision@5 | Pooled nDCG@5 |
|---|---:|---:|---:|
| release_lexical | 35% | 11.0% | 0.287 |
| full_dense | 65% | 17.0% | 0.487 |
| hybrid | 70% | 21.0% | 0.534 |
| balanced | 70% | 20.0% | 0.536 |
| balanced_rerank | 80% | 28.0% | 0.712 |

## Ranking versus admission

A top-five list can contain weak fallback items that are never admitted to RAG. The final admission gate is a separate precision/coverage tradeoff:

| Set | At least one admitted source judged usable | Admitted records | Judged usable among admitted |
|---|---:|---:|---:|
| Original 50 | 86% | 97 | 67.0% |
| Additional 20 | 75% | 35 | 51.4% |

Do not present top-five ranking coverage as delivered RAG coverage. The selector and grader are the **same model**, even though the grading packets hide methods and selector reasoning. Correlated errors can overstate gains. Human relevance/grounding ratings and a genuinely independent validation set are still needed; no human humor or preference improvement is established.

## Integration and verification

Final ranking-contract failures: **0/70**. The earlier free-form quote preflight failed on three queries; all failures are retained. The final source-span contract was rerun across all seventy rather than removing the hard cases.

The final ten-image private pilot used actual Supabase retrieval and the integrated ranking/merge stage: **10 ready, 0 degraded, 0 failed**, median 18.16 seconds. These are training images and technical outcomes, not human quality ratings. SQL filters remain authoritative: local lexical/mechanism channels cannot reintroduce IDs excluded by database searches. SQL and local candidate pools can differ, so local retrieval metrics are not asserted as SQL-backend quality scores.

**26 Python tests passed**, including channel diversity, invented-ID rejection, verbatim span resolution, the unchanged eight-call budget, weak-source degradation, and remote eligibility filtering. The input/code/index fingerprints and original experiments are preserved. No UI or SQL schema changes were required for this follow-up.

Estimated committed/unknown-reserved API usage across the project qualification is **$1.090891 of $25**. This is usage-based accounting, not an invoice. API calls are complete for this checkpoint.

[Machine-readable results](retrieval-ranking-results.json) · [implementation](../../services/humorllm/README.md) · [operations](operations.md). The private ignored report `.local/humorllm/retrieval/ranking-report.html` lets you inspect each query's original and reranked sources.

The offline report also passed desktop/mobile browser checks, seven query switches across all four comparison modes, JavaScript-disabled summary fallback, and zero external requests or page errors. All 132 admitted source references in the text evaluation resolve to verbatim original text.
