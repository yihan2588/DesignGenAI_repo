# Verification checkpoint — October 22, 2026

Baseline: user-supplied Vercel deployment `design-gen-ai-repo-oc112fjxq-yihan2588-5788s-projects.vercel.app`, verified through Vercel metadata as commit `13edf43fd3a5de69f6f2e3d07724d5fa86286bf6`.

- 31 Node tests pass, including isolated PostgreSQL authorization and transactional admin behavior; model requests and ranking math tests.
- ESLint and production webpack build pass.
- Additive migrations applied to the existing shared Supabase project. Existing caption/vote content retained; checked historical provenance separately maps legacy revisions.
- Two existing operator-owned Google profiles bootstrapped through trusted SQL; other profiles remain members. Member profile UPDATE grants exclude `is_superadmin`.
- Supabase advisor: private RLS tables intentionally deny direct access. Public RPCs use invoker wrappers over private checked implementations. Pre-existing leaked-password protection notice remains; app sign-in is Google OAuth.
- Real Chrome login against the local production build succeeds using an existing Google operator account; overview reads live counts and provenance-backed historical matchups.
- Prompt editor and media/people navigation are undergoing browser verification. Hosted authenticated CRUD and responsive checks are not yet claimed.

No concurrency proof is claimed from PGlite, which serializes connections. Activation/archive lock the same singleton row, and claims retain revisions transactionally. Repeated voters and images limit the interpretation of ordinary binomial intervals. Delete removes an entire image entry, pairs and votes; Storage API cleanup is a separate step and reports failures explicitly.
