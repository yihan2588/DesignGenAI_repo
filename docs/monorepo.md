# FunnyLLM repository and deployment map

The user and admin apps share one Git repository and one existing Supabase project. They remain independent Next.js applications so routes, cookies, working-directory asset paths, environment variables, and access controls do not change.

| Component | Source root | Project |
|---|---|---|
| User app | apps/web | Vercel funnyllm |
| Admin | apps/admin | Vercel funnyllm-admin |
| Database/Auth/Storage | canonical SQL in apps/web/supabase | Supabase FunnyLLM, ID nqmwkajkucwfipdowvzh |

Each app has its own lockfile and install/build/test commands. From the repository root, `pnpm install:apps`, `pnpm test`, `pnpm lint`, and `pnpm build` operate on both. Dev commands are `pnpm dev:web` and `pnpm dev:admin`. Configure separate ignored `.env.local` files in the app folders.

The shared SQL copies under admin are retained for historical SQL tests; do not apply both copies. This consolidation does not change SQL, Auth policies, storage, provider keys, or the database URL. Canonical domains are `funnyllm.vercel.app` and `funnyllm-admin.vercel.app`. Old domains redirect page navigation, while in-flight auth callbacks and API requests retain their original host. See [OAuth setup](../apps/web/docs/setup.md#production-urls-and-google-login).

Both original Git histories are reachable from the consolidation merge commit. The former admin GitHub repository is retained as a read-only archive, with current development in FunnyLLM. Never delete or rewrite the old history as part of this migration.

The study guide lives in apps/web/docs/study-guide; historical verification records remain in their app's docs folder.
