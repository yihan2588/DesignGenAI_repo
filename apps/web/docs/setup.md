# Local setup and deployment

This is the source for the deployed FunnyLLM user app. The companion admin app uses the same Supabase project and runtime configuration. A provisioned base database is a prerequisite; the repository does not export Auth accounts, Storage contents, credentials, or the complete base schema.

## Run the code

Use Node.js 24 and pnpm as pinned in `package.json`. Install dependencies with `pnpm install --frozen-lockfile`. Copy `.env.example` to ignored `.env.local` and provide:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | The provisioned project's API URL |
| `SUPABASE_ANON_KEY` | Its configured anon key; application authorization still uses user sessions and SQL policies |
| `GEMINI_API_KEY` | Server-only Gemini generation and embedding access |
| `HUMOR_WRITER_KEY` | The narrow server writer secret whose SHA-256 hash matches `private.humor_config.writer_key_sha256` |

Keep secrets out of source, logs, screenshots, and client components. No service-role key is needed by either app. In a new environment, provision the writer secret and database hash together through an authorized administrative connection; do not invent or reuse production credentials.

Run `pnpm dev --webpack` and open `http://localhost:3000`. The webpack option supports this workspace's shared dependency symlink. The admin can run on another port with `pnpm dev --webpack --port 3001`.

## Database and identity prerequisites

1. Reconcile the existing schema and applied migration ledger before executing any SQL. The first checked-in migration already references `public.food_photos` from the required base schema.
2. Compare checked-in SQL with the target project’s applied migration ledger. Match content as well as names; never replay a migration already applied under another timestamp.
3. Configure Google OAuth in Supabase and the Google provider. Register the actual local and deployed `/auth/callback` origins for each app. Public user eligibility includes all Google accounts; admin RPCs require verified Google identity and the exact configured allowlist.
4. Provision the private upload/library/gallery buckets and policies from the migrations. Make catalog rows and their media available; source image files alone do not seed the database.
5. Prepare/import the catalog only through the [documented pipeline](co-writer.md#teaching-data-preparation). Raw course exports and `.cowriter-cache/` stay outside Git. Initial teaching media are already tracked in `public/catalog/`; new admin uploads use private Storage.

The PGlite fixtures are isolated tests, not a production restore script. A portable empty-project bootstrap remains future work.

## Verify and deploy

`pnpm test`, `pnpm lint`, and `pnpm build` are deterministic code checks. A real flow additionally needs sign-in, generation, refinement, export, publish/unpublish, moderation, and an anonymous media-access check. Keep paid provider evaluations separate from normal tests.

Both apps publish from the FunnyLLM monorepo on `main`, with Vercel roots `apps/web` and `apps/admin`. Configure each Vercel project with the same appropriate server-side environment values and its own URL. Keep root-scoped deployment exclusions: `/supabase` must not accidentally exclude `lib/supabase/`.

Use the admin's writing pause during an incident; saved drafts, manual edits, and exports remain available. Do not run destructive down migrations during an application rollback.

## Production URLs and Google login

- User app: https://funnyllm.vercel.app
- Admin: https://funnyllm-admin.vercel.app/admin
- Supabase Site URL: `https://funnyllm.vercel.app`
- Supabase allowed redirects: `https://funnyllm.vercel.app/auth/callback` and `https://funnyllm-admin.vercel.app/auth/callback`.

The Google provider's authorized redirect URI remains `https://nqmwkajkucwfipdowvzh.supabase.co/auth/v1/callback`. This is distinct from each application's callback. App OAuth actions derive their redirect from the current public host; no new URL environment variable or credential is needed.

Browser sessions are scoped to each app’s hostname. A user can be signed in to the user app while signed out of the admin app. The Account → Admin link changes location; it does not transfer credentials or grant permissions.
