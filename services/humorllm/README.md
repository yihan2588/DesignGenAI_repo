# HumorLLM Python pipeline

Read the [grounding and source-transfer follow-up](../../docs/humorllm/grounding-transfer-audit.md) and earlier [coverage and ranking audit](../../docs/humorllm/retrieval-ranking-audit.md). The research `balanced_rerank` mode adds a twenty-record multi-channel shortlist and independent source review and grounded selection in a nine-call pipeline, with two additional calls for a source-free fallback when needed (twelve attempts maximum). Public activation remains disabled. The qualified research default is now Gemini 3.8 Flash; direct baseline, source selection/review, writer and judge use the same model; visual and image-association drafts use Flash-Lite; the independent description association uses Flash. `--model gemini-3.1-flash-lite` remains available for explicit development comparisons.

Experimental HOMER-inspired generation behind the existing paired-caption application. Read the [development status](../../docs/humorllm/development-status.md) for measured results, limits, and deployment state. The default web app still uses its MVP prompt chain.

The implemented path is image → draft scene → image-conditioned scene audit/conflicts → independent image/description associations → bounded retrieval-backed graph → selected paths/demonstrations → five candidates → judge → up to three acceptable captions. The conflict checkpoint contains the audited scene and removed claims; only the audited scene and conflicts enter later creative stages. Uncertain object identities/functions belong in `uncertainties`, outside source-evidence anchors. A separate direct baseline sees only the image and shared style constraints. The reviewed retrieval mode uses nine normal Gemini calls. When no retrieval-backed caption qualifies, fresh candidates are written and independently judged from the verified scene, conflicts and original source-free associations, with no retrieved jokes, source plans, critiques or prior candidates in those requests. This needs eleven calls, with twelve persistent attempts maximum, one schema repair, a 300-second invocation deadline, cached stages and cost reservations. Results record `guided_mode=rag` or `no_rag_fallback`; fallback captions never count as successful source transfers. Safety, physical grounding and copy checks remain enforced. See [launch readiness](../../docs/humorllm/online-readiness.md).

This is a product adaptation, not a reproduction of HOMER. Pruning uses embedding relatedness plus document frequency rather than the paper's WordNet/POS-based formula. No release prompts/code were vendored. The frozen lexical reference follows the inspected release's substring-first/query-fitted TF-IDF behavior, with literal escaping for user entities. See [compatibility notes](../../docs/humorllm/compatibility.md).

## Setup and local execution

Use Python 3.12+ and an isolated environment. From the repository root:

```sh
python3 -m venv services/humorllm/.venv
services/humorllm/.venv/bin/python -m pip install -r services/humorllm/requirements.lock
services/humorllm/.venv/bin/python -m pip install --no-deps -e services/humorllm
PYTHONPATH=services/humorllm/src services/humorllm/.venv/bin/python -m unittest discover -s services/humorllm/tests -v
```

`requirements.lock` records the tested macOS CPU environment; GPU/platform variants require separate qualification. Annotation-only tools remain standard-library Python. Full runtime needs the pinned dependencies. The encoder is `sentence-transformers/all-mpnet-base-v2`, revision `e8c3b32edf5434bc2275fc9bab85f82640a19130`, normalized 768-dimensional float32 on CPU. Model downloads occur only during explicit embedding setup; generation loads cached weights locally.

```sh
PYTHONPATH=services/humorllm/src services/humorllm/.venv/bin/python -m humorllm.cli embed --corpus .local/humorllm/annotations/annotated-1000.jsonl
PYTHONPATH=services/humorllm/src services/humorllm/.venv/bin/python -m humorllm.cli run --image /absolute/path/image.jpg --run-id unique-id --retrieval full_dense
PYTHONPATH=services/humorllm/src services/humorllm/.venv/bin/python -m humorllm.cli pilot --manifest .local/humorllm/evaluation/smoke-10.jsonl --prefix new-experiment --backend supabase --retrieval full_dense
```

The CLI reads `.env.local` without executing it. Never paste credentials into chat or commit them. Supabase mode uses `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and a separate `HUMOR_WORKER_KEY`; no service-role key. Outputs and model caches are ignored under `.local/humorllm/`. Exit codes: 0 all ready, 1 any failed, 2 degraded without failures. A completed run ID reuses its result; changed image/code/config/corpus requires a new ID. Each invocation allows at most 20 cases. The local shared SQLite ledger refuses a ceiling above the authorized $25, retains unknown costs, and persists across invocations. Do not delete or replace it to reset spending.

## Retrieval and worker

Local exact retrieval supports full-joke dense search and three-channel rank fusion (situation, mechanism, SQLite FTS5 BM25; RRF constant 50). The versioned index holds only allowed English training records and filters held-out/duplicate records before search. Production load refuses the current research manifest. Supabase adds exact pgvector scans and English full-text fusion; its lexical scorer is `ts_rank_cd`, so local hybrid metrics are not automatically SQL hybrid metrics. No approximate index or corpus recall claim is made.

The additive migration provides a private source library, capability-protected RPCs, leased jobs, stage checkpoints, shared model-attempt/cost reservations, and transactional publication. Public tables retain their original A/B vote semantics. See [operations](../../docs/humorllm/operations.md) before configuring the worker. Public generation, ingestion, and production corpus approval are currently false. The current research library cannot be activated merely by setting an environment flag.

The annotation workflow processed 1,000 entries and selected 528 research candidates. Read the [annotation contract](annotation-contract.md), [source manifest](manifests/cleancomedy-en-1000-v1.json), and [annotation results](../../docs/humorllm/annotation-results.json). All final includes received AI coordinator review, not human approval. The source repository declares CC-BY-4.0; upstream per-item provenance remains unresolved. Source text stays private and untracked. Human/source qualification, held-out-caption overlap checks, and improved retrieval remain prerequisites for production or expansion to 10,000.

The user paused the 3,000-new-situational expansion and requested completion of the existing 759-candidate pool. All 759 now have GPT-6 Luna cross-worker review; 480 new situational records passed the final gates and were imported. The active default index contains **1,003 research examples: 689 situational and 314 wordplay-only**. All 1,008 stored rows are preserved; four legacy low-transfer examples and one legacy duplicate are disabled for retrieval. Read the [reviewed corpus and image rerun](../../docs/humorllm/reviewed-corpus-rerun.md). The [expansion contract](expansion-contract.md) requires source-specific interpretations, substitution tests, image prerequisites and cross-worker review. `humorllm.expand_corpus` preserves ordered submissions and hashes; it never infers annotations. `humorllm.corpus_audit.near_duplicate_pairs` proposes overlap flags for manual adjudication. Private state remains under `.local/humorllm/expansion-3000/`. Qualified wordplay stays separately labeled, production approval remains false, and the original 3,000 target has not been achieved.

## Private artifacts

All source text and annotations are gitignored under `.local/humorllm/annotations/` at the repository root:

- `report.html`: offline searchable audit, with source text, decisions, interpretations, and review scope.
- `annotated-1000.jsonl`: complete records, normalized source hashes, model/protocol provenance, and review metadata.
- `curated-research.jsonl`: inclusion candidates, including lexical puns. This filename does not imply human approval or production eligibility.
- `review-queue.jsonl`, `excluded.jsonl`, and `human-review-queue.jsonl`: held, excluded, and non-excluded records respectively.
- `pilot/` and `scale/`: assigned inputs, submitted worker outputs, agreement, review IDs, corrections, and worker audit receipts. Expansion outputs include feedback on two shared entries; their agreement is not fully blind. Earlier `independent-annotations.jsonl` files are legacy grouped copies, not a claim of blind expansion labeling.
- `finalize.py`: local assembly script that applies explicit coordinator corrections without altering submissions.
- `summary.json` and `manifest.json`: outcomes, limitations, source/output hashes, and stage status.
- `integrity-check.json`, `browser-qa.json`, and `verification.json`: final validation receipts and tested artifact hashes. `verify.py` reruns the data integrity checks.

All final inclusion candidates received an AI coordinator check of source/core semantic fields. This is not a complete factual audit, a human gold set, a calibrated accuracy estimate, or a retrieval-quality result. Non-included expansion records may have worker-only semantic review. The later worker alignment audit is narrower than coordinator semantic review.

## Reproduce sampling and validation

These tools use Python's standard library and never call a model. Run from the repository root with Python 3.10+:

```sh
PYTHONPATH=services/humorllm/src python3 -m humorllm.annotations prepare /path/to/source.csv --root /tmp/humorllm-reproduction
PYTHONPATH=services/humorllm/src python3 -m humorllm.annotations validate .local/humorllm/annotations/scale/worker-1-input.jsonl .local/humorllm/annotations/scale/worker-1-output.jsonl
PYTHONPATH=services/humorllm/src python3 -m humorllm.annotations collect --root .local/humorllm/annotations --stage scale
PYTHONPATH=services/humorllm/src python3 .local/humorllm/annotations/finalize.py
PYTHONPATH=services/humorllm/src python3 .local/humorllm/annotations/verify.py
PYTHONPATH=services/humorllm/src python3 -m humorllm.annotation_report .local/humorllm/annotations
PYTHONPATH=services/humorllm/src python3 -m unittest discover -s services/humorllm/tests -p 'test_annotations.py' -v
```

Sampling uses deterministic SHA-256 ordering within four source-label/length strata: 50 per stratum for the pilot, 250 per stratum for the 1,000-entry set. The binary source label is sampling metadata only. Original `full_joke` text is NFKC/whitespace-normalized for identity; source setup and punchline fields are retained separately. Model annotation itself is not reproducible merely by rerunning sampling, and no script auto-generates semantic labels.

The focused annotation tests cover schema/identity constraints, coverage, deterministic sampling, and raw agreement. The original annotation stage did not run Gemini, embeddings, database imports, or caption-quality evaluation. Subsequent pipeline work is documented above; the contract and pipeline suites now pass. Human review, source-use qualification, held-out-caption overlap checks, and independent retrieval qualification remain before production use or expansion to 10,000.

## Ranking regression reproduction

`balanced_rerank` is an opt-in research mode combining dense, hybrid, release-reference lexical and mechanism channels under a twenty-source cap. Graph queries carry each hop's relation probe and visible anchor. The adapter makes two concrete source-based prototypes; a separate reviewer critiques them. Structurally valid hypotheses reach the writer even if that advisory review rejects them, so the writer can repair the actual joke rather than stopping before generation. At least two of five candidates attempt source adaptations. Source applications quote the whole caption; the final image-conditioned judge must locate both the mapped setup and distinctive turn. Wordplay, provenance, copy and physical-grounding checks remain enforced.

`retrieval_evidence_ids` counts only supported transfers among retained captions, and `selected_caption_source_ids` isolates the winner. The historical `admitted_source_ids` field records exposure, not successful contribution. If no source-backed caption passes, the default flow runs the source-free HOMER-inspired fallback and publishes its checked caption as the guided track. If that bounded branch also fails safety/grounding or the provider is unavailable, the run fails with a retryable generation error. Strict research ablations can disable the fallback explicitly; they are not the app configuration. The flow uses nine normal calls, eleven with fallback, within a twelve-attempt cap. Semantic stages use explicit medium thinking and an 8,192-token ceiling. Baseline and guided caption stages use the same registered model; visual/image-association drafts use Flash-Lite. Read the [source-to-caption audit](../../docs/humorllm/source-caption-handoff.md) for design, model changes, tests, limitations and the private two-image comparison.

```sh
PYTHONPATH=services/humorllm/src services/humorllm/.venv/bin/python -m humorllm.cli run --image /absolute/path/image.jpg --run-id new-ranked-run --retrieval balanced_rerank --backend supabase
```

The evaluation CLI is `python -m humorllm.ranking_eval prepare --queries /path/to/queries.jsonl --output /new/private/experiment`, followed by `python -m humorllm.judge_retrieval --experiment /new/private/experiment --ledger .local/humorllm/usage.sqlite`, then `python -m humorllm.ranking_eval score --output /new/private/experiment`, with `PYTHONPATH=services/humorllm/src`. It freezes query/index/code identities, preserves prior output directories, counts contract failures rather than dropping them, and reports both top-five ranking and stricter admission metrics. Never reuse a completed experiment directory with changed inputs/code.

The SQL backend restricts the pool to source IDs returned by eligible SQL searches; local lexical/mechanism channels cannot reintroduce filtered records. This can yield a different pool from local exact retrieval. Offline ranking scores are not automatically SQL-backend quality scores; the separate private image pilot exercises actual SQL integration.
