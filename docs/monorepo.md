# Repository and deployment map

| Component | Source | Production |
|---|---|---|
| Gallery and Funny Lab | `apps/web` | https://funnyllm.vercel.app |
| Operations app | `apps/admin` | https://funnyllm-admin.vercel.app/admin |
| Auth, database and Storage | `apps/web/supabase` is the canonical migration source | Shared Supabase FunnyLLM project |

Each app has an independent lockfile, `.env.local`, working directory and Vercel project. Root commands `pnpm install:apps`, `pnpm test`, `pnpm lint`, and `pnpm build` run across both. Use `pnpm dev:web` or `pnpm dev:admin` for development.

Vercel deploys `main` using the corresponding app root. Configure credentials separately for each app. Do not apply duplicate SQL copies; reconcile the canonical migrations against the provisioned database ledger.

Account → Admin is ordinary navigation. Host-scoped sessions and the admin’s server/database allowlist remain independent. See [OAuth and environment setup](../apps/web/docs/setup.md).

The [study guide](../apps/web/docs/study-guide/README.md) is editable offline HTML. Runtime inputs, private traces and credentials are not portfolio artifacts.
