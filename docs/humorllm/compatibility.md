# HOMER compatibility and product adaptations

This implementation follows the high-level mechanism in [HOMER](https://arxiv.org/html/2602.06423v2): visible scene → conflicting interpretations → independent association views → retrieved comic structures → candidate generation → evaluation. It does not claim a paper reproduction or transfer the paper's reported performance to this app.

| Component | Implemented behavior | Boundary |
|---|---|---|
| Vision and conflict | Draft details → image-conditioned scene audit and conflicts; corrected scene and separate uncertainty/rejected-claim records | Model judgments remain fallible; ID validation is not human visual verification |
| Association | Independent image-conditioned and description-conditioned calls, preserved chains | Product caps two target paths and three hops; no arbitrary path splicing |
| Retrieval | Eligibility before exact top-k; full-joke dense or situation/mechanism/lexical fusion | 528 private research examples; source-use and held-out-caption audits incomplete |
| Lexical release reference | Substring-first five hits; query-fitted TF-IDF fallback; reverse-argsort ties | Literal regex escaping is deliberate; adapter is not imported release code |
| Graph/pruning | Retrieved annotation entities can form bounded branches; embedding relatedness plus document frequency | Replaces the paper's WordNet/POS and paper-specific scoring; not formula parity |
| Prompt budget | Up to eight retrieval queries, five hits/query, twenty distinct sources; selected demonstrations ≤1,500 UTF-8 bytes | Conservative text bound; not an exact tokenizer measurement |
| Generation | Five unique short captions; linked detail/path/source references | No human relevance or humor guarantee |
| Selector | Image-conditioned judgments plus original source text; exact candidate application spans, per-source transfer checks, grounding/safety/copy/duplicate filters | `balanced_rerank` requires verified source use; association-only diagnostics cannot publish a RAG pair. Semantic checks remain model judgments |
| Comparison | Independent one-call image baseline; selected guided caption; persistent random A/B positions | Eight normal calls give guided method more compute; superiority requires matched-budget controls |
| Recovery | Input/code/corpus/config fingerprint; stage checkpoints, shared ten-call limit and cost reservations | Unknown provider outcomes stay reserved; no automatic promise of exactly-once provider execution |
| SQL retrieval | Exact pgvector cosine and English full-text `ts_rank_cd` fusion | Dense parity verified on 50 queries; local SQLite BM25 hybrid metrics do not transfer automatically |

The frozen retrieval test gives all three reference methods the same synthetic scene, conflict, and mechanism information. Dense embeddings include scene + conflict + mechanism. Runtime full-dense queries now follow that information policy. Earlier `homer-dev-v2` outputs used a description-only dense vector and are retained as development history, not measurements of the final query policy. Hybrid `v3` also changed judgment parsing, so comparing its readiness with `v2` does not isolate the retriever.

No held-out reference captions were supplied to generation. Ten development cartoons were selected from training groups after contest-ID, exact-hash, and perceptual-hash clustering; perceptual deduplication is heuristic. One corrupt asset was quarantined. Original cartoon assets remain ignored and are not approved for the public feed. Foundation-model pretraining contamination is unknown.

Provider integration uses the existing [Gemini Interactions API](https://ai.google.dev/api/interactions-api), `store:false`, a fixed model, bounded image/prompt/schema/output sizes, and schema validation. The [pricing record](https://ai.google.dev/gemini-api/docs/pricing) checked October 16, 2026 uses $0.25/M input and $1.50/M output plus thought tokens. Amounts in reports are usage-based estimates, not billing reconciliation.

## Ranking follow-up

The optional `balanced_rerank` mode broadens candidate search, retains at most twenty distinct source records for the existing merge call, and includes original jokes as well as annotations. The merge ranks up to five sources and references supplied verbatim source excerpts and scene anchors. Only grade-2 sources may support demonstrations/retrieved paths; unaccepted sources are removed from those paths. This changes retrieval/merge behavior without adding a model call or changing the independent baseline. The previous modes remain available for paired comparisons. See [the ranking audit](retrieval-ranking-audit.md).

The subsequent [grounding/transfer audit](grounding-transfer-audit.md) changes the runtime prompts and stage schemas (`humorllm-python-3-grounded-transfer`). The existing conflict checkpoint now includes an audited scene; the existing judge also verifies actual source-to-caption transfer. Checkpoint names and the eight-call/ten-attempt bounds are unchanged, so no SQL migration is needed. New fingerprints deliberately refuse old checkpoint replay. Earlier retrieval metrics and pilot readiness remain measurements of their frozen versions; they do not qualify this newer contract.
