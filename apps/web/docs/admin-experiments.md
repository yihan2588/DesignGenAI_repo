# Admin-selected caption experiments

Based on the user-approved feedback-complete MVP commit `13edf43`.

The media app calls `humor_experiment_claim` rather than the original claim RPC. The database captures two immutable prompt revision IDs atomically with claiming the run; the server receives the corresponding model/prompt/system/temperature configuration through a writer-key checked API. No configuration is exposed in the public feed before voting. The pre-RAG generator uses a neutral scene plan and either a direct-caption or planned-candidate strategy for each chosen configuration. There is no retrieval worker.

The existing finish transaction still randomizes slot assignment and atomically persists the two captions. The saved-vote-gated poll now returns revision names, so custom configurations do not inherit legacy Baseline/HOMER-inspired labels. Public card and poll-summary labels share the same tested resolver. Existing legacy captions remain immutable.

The separate admin repository is https://github.com/yihan2588/FunnyLLM/tree/main/apps/admin. It shares this app's Supabase database and contains prompt/media management plus ranking and user/vote inspection. Both repositories carry the same additive database migrations; they are already applied remotely and should not be replayed blindly.

Verification: 29 Node tests, ESLint, TypeScript and the production webpack build pass. Hosted admin upload generated a real complete pair, recorded active revisions, saved a vote, and revealed labels. Its approved synthetic test records were removed afterward. Final deployment URLs and browser receipts are reported separately.
