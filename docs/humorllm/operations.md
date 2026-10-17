# HumorLLM operations and release gates

## Installed state

The additive `20261016180840_humorllm_retrieval_and_worker.sql` migration is applied to the existing course Supabase project. Existing runs, images, and votes were preserved byte-for-byte by ordered row hashes. There are 1,008 stored English research examples; 1,003 are active (689 situational and 314 wordplay-only), with three normalized 768-dimensional vectors each. Generation, ingestion, and production approval are **disabled**. Zero examples are production eligible. No deployment changed the app's generation mode.

`private` stores sources, vectors, configuration, jobs, model-call reservations, checkpoints, and traces. There are no direct anonymous/authenticated table privileges on these new tables. Their RLS deliberately has no client policies. Thin public invokers call capability-checked functions in the non-exposed `humor_worker` schema. Privileged functions have fixed empty search paths and explicit execution grants. A separate random worker secret is stored locally; only its SHA-256 digest is stored in the database. Do not use a service-role key or expose either capability in browser code.

The Supabase security advisor reports informational RLS-without-policies notices for these intentionally inaccessible private tables ([explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). Its pre-existing leaked-password-protection warning is an account configuration item outside this pipeline migration ([reference](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).

The new local migration filename matches remote version `20261016180840`. Older repository migration timestamps already differ from this project's MCP-applied history; reconcile that pre-existing history before using `supabase db push` against this shared database. Do not replay the applied schema.

## Worker lifecycle

1. The Next server defaults `HUMOR_PIPELINE_MODE` to `mvp`. `worker` opts into enqueueing only after the verified session, origin, run ownership, and writer capability checks. No worker means a generic unavailable response.
2. The enqueue function checks administrator activation, corpus approval, recent worker heartbeat, per-project quota, and pending run ownership. Repeated enqueueing is idempotent. Jobs have a 15-minute overall deadline.
3. A Python process loads and validates the production index before announcing health. The current research manifest intentionally fails this check. A healthy process claims one job using `FOR UPDATE SKIP LOCKED`, a fresh token, and a 120-second lease. At most three job claims are allowed.
4. Before every Gemini HTTP call, a database reservation holds $0.10, enforcing twelve attempts per run after the fallback migration and the shared $25 ceiling. Unknown usage remains reserved. Known usage is settled idempotently; an unexpectedly high cost stops scheduling. Checkpoints extend the lease; expired tokens cannot save stages or publish.
5. The input/code/corpus/config fingerprint must match before successful stages can be restored. Local SQLite state and database checkpoints survive process replacement. Calls are not blindly replayed after ambiguous network outcomes.
6. Publication checks lease, owner, deadline, source qualification, metadata, and two distinct short captions. Metadata for a new image, hidden method assignment, private result, and both captions commit together. A checked source-free fallback can publish a pair with private `guided_mode=no_rag_fallback` provenance and empty successful-source IDs. Failed generations publish no pair. Existing ready pairs remain immutable. The browser polls the owner-only status endpoint while generation is active; votes and method revelation use the original RPCs.

After explicit source and quality approval and provisioning a reviewed index, a worker would run from the repository root:

```sh
PYTHONPATH=services/humorllm/src services/humorllm/.venv/bin/python -m humorllm.worker work
```

Keep one worker process per persistent state directory. Multiple workers require separate directories and unique worker IDs; database leases/reservations coordinate them. The development SQL test exercises five logical workers and twenty jobs in PGlite, which serializes connections. True concurrent five-worker contention, authenticated browser → queue → worker → published result, and process-kill recovery in a deployed environment remain release checks. Do not describe the isolated test as those checks.

## Research ingestion and budget

The private import command is `python -m humorllm.worker ingest` with `PYTHONPATH` set as above. An administrator temporarily opens `ingest_enabled`; the client sends batches of at most twenty, validates identities and pinned embeddings, and the server forces research-only eligibility. Repeated same-version/ID input is idempotent; changed source text requires a new version. Close ingestion after a bounded import. Do not set production flags to bypass a failed qualification gate.

CLI qualification uses the persistent `.local/humorllm/usage.sqlite` ledger. Hosted workers use database reservations and `prior_spent_usd`. Before any hosted worker starts, reconcile the local ledger into `prior_spent_usd` and freeze local API qualification or account for it centrally, so concurrent runs cannot double-use the authorized budget. Never clear either ledger to reset spending. Failed or unknown calls count toward reservations/attempt limits. The database default records the local spend observed at migration time; the final development receipt records the reconciled amount.

The worker is not deployed or supervised as a service yet. SIGTERM stops new claims after the current bounded run; hard crashes depend on lease expiry and persisted checkpoints. No GPU or new model provider was provisioned.

## Before production activation

Resolve source-use eligibility and benchmark display rights, audit duplicate/held-out overlap, improve and independently qualify retrieval, and perform human humor/relevance/usability review. Then test real multi-worker contention and recovery, an authenticated uploaded-image workflow, method hiding and persisted voting, and deployment configuration. Expand to 10,000 only if that evidence justifies it. The current 72% AI-graded retrieval hit@5 misses the 80% development target and does not satisfy a human release gate.


## Source-free fallback compatibility

The local `20261017001920_humor_no_rag_fallback.sql` migration is tested in isolated PostgreSQL but not applied to the shared database. It allows `fallback_candidates` and `fallback_judge` checkpoints, raises the persistent cap to twelve attempts (nine regular calls plus two fallback calls and one repair), and permits a larger bounded runtime receipt for the extra traces. It retains capability, lease, shared-budget, immutable-publication and vote gates. Publication checks the guided mode and refuses a fallback that claims successful source IDs. It updates the default model/retrieval settings while generation is disabled; it does not activate generation or approve sources.

The fallback writer and independent judge see the image and verified source-free scene/association context. They do not see retrieved examples, source-conditioned paths, critiques or failed candidates. The final deterministic checks still compare against the private corpus for accidental copying. No arbitrary caption is substituted if safety checks or the provider fail.

Read [online readiness](online-readiness.md) for the current release assessment and verification scope. Do not run `supabase db push` against the shared project before reconciling its older migration-history mismatch.
