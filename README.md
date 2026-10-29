# FunnyLLM Admin

Operations for the FunnyLLM gallery and co-writer, using the same Hum visual system as the user app.

| Area | Purpose |
|---|---|
| Overview | Recent requests, failures, draft compute p95, catalog readiness, reports and writing pause |
| Content | Feature, inspect, remove and restore gallery posts; review reports |
| Image library | Upload sanitized images, edit descriptions and relationships, re-embed, retire from retrieval |
| Activity | Request history, errors, saved results, model usage, bounded prompt/response traces |
| Workflow | Read the source-controlled workflow; manage Gemini model entries and validate selection |
| Examples | Create/edit/retire few-shot examples; at most three active for new sessions |
| People & access | Read users and the exact admin allowlist |

User-app Google signup is open. Admin access requires a verified Google identity with one of `yihan2588@gmail.com`, `yw4756@columbia.edu`, or `hg2736@columbia.edu`. The database checks this on every admin read/write; old superadmin flags alone do not authorize access. No service-role key is used by the apps.

There is one co-writer workflow and one implemented provider adapter, Google Gemini. Provider information is read-only. Model selection probes the Interactions API and structured output before activation. No terms, prompt mix or signup-domain management is presented. Prior comparisons and prompt configurations are archived; old mutation handlers and database privileges are retired.

## Run and verify

Use the existing ignored `.env.local` values from `.env.example`, then `pnpm install --frozen-lockfile`, `pnpm dev --webpack`, `pnpm test`, `pnpm lint`, and `pnpm build`.

The release system and security contracts are documented in [gallery-system.md](docs/gallery-system.md). Automated checks, local live-backend browser checks and production checks are distinct evidence. Historical release evidence remains in `docs/admin-verification.md`.
