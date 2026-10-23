# Week 6 verification — October 22, 2026

## Baseline and scope

The user-supplied deployment `design-gen-ai-repo-oc112fjxq-yihan2588-5788s-projects.vercel.app` was verified through Vercel metadata as commit `13edf43fd3a5de69f6f2e3d07724d5fa86286bf6`. This preserves the prior feedback implementation. The new admin app is in a separate private repository and Vercel project. Generation uses the pre-RAG app's Gemini transport and scene-plan/caption approach; it does not dispatch the retrieval worker.

## Automated verification

- 33 Node tests pass, including isolated PostgreSQL authorization, member self-promotion denial, Google-provider checks, immutable revision storage, pair activation/archive checks, transactional claims, hidden method assignment, vote persistence and entry cascades.
- Mocked generation verifies each selected model, prompt, system prompt and temperature reaches the provider request, quota errors do not retry, and duplicate final captions cannot publish.
- Ranking tests cover side swapping, event order, bounded intervals, empty samples, finite scores and separate ranks for disconnected opponent groups.
- ESLint, TypeScript and production webpack builds pass. The media integration has 29 passing tests.

PGlite serializes connections. It verifies PostgreSQL behavior, not real concurrent contention. Activation/archive serialize on the singleton experiment row; claims snapshot revisions in the same transaction as generation claiming.

## Live database and browser checks

- Additive migrations applied to the existing shared Supabase project. Members cannot update `profiles.is_superadmin`, read private revisions directly, or call admin RPCs anonymously. Public RPCs are invoker wrappers around private implementations with explicit authorization.
- Existing operator-owned Columbia and Gmail Google profiles were bootstrapped through trusted SQL. Other profiles remain members.
- Real Chrome Google login succeeds locally and on the immutable admin deployment. A login-return bug was corrected so sign-in lands in `/admin`.
- Anonymous HTTP checks across admin routes, nested routes and APIs redirect to login; login returns 200. Vercel deployment protection is disabled, independently of application authorization.
- Browser create/edit prompt tests preserved a separate parent revision and persisted Gemini 2.5 Flash, temperature 0.7 and a custom system prompt. Activation was tested and restored. The hosted API initially rejected the singleton UPDATE because safeupdate requires a WHERE clause; the tested correction uses an explicit singleton predicate.
- A synthetic chair image passed the actual browser upload preparation and hosted Gemini generation. Run `ad04215e-0eb2-44ff-afbc-7e1f368e3cf8` persisted both captions with `admin-config-v1`, active revision IDs and exactly planning/candidate_1/candidate_2 stages. No RAG stages were used.
- The saved vote revealed the correct randomized configuration names. This exposed a legacy hard-coded poll-summary label; both apps now use a shared tested label resolver.
- The synthetic entry title was updated through the browser. After explicit approval, the complete image entry, pair and vote were deleted through the browser, and its storage object was removed. SQL readback confirmed zero remaining test image/run/vote/object records and original counts of 23 images, 33 runs and 25 votes. The two QA configurations were retired and the original active pair restored.
- Mobile QA found min-content grid overflow; the corrected local production build has document width 375 at viewport width 375. Final hosted responsive checks are performed after deployment.

A live negative-access test that would temporarily revoke the operator's role was rejected by automatic approval review because that authorization change was not explicitly approved. No role was changed. Isolated member-denial tests and live anonymous checks are the completed negative-access evidence.

## Deployment and remaining operational limits

The original project scopes older preview secrets to its RAG branch. The new media integration branch has its own four scoped secrets; a Git-backed rebuild is required to select them. CLI upload from the linked worktree did not attach Git metadata and was not used as the final release. Existing production and the RAG branch were preserved.

The new private admin repository requires additional GitHub-installation access before Vercel can connect it for automatic Git deployments. Manual CLI deployments work and include their source commit metadata. No permissions were expanded for that optional integration.

Supabase advisors retain intentional deny-by-default private-table RLS notices and the pre-existing leaked-password-protection warning ([remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). App login uses Google OAuth. Delete Storage cleanup is a separate API operation and reports a cleanup failure explicitly.

Statistical limits: raw Wilson intervals assume independent votes; repeated people/images limit certainty. Scores and ranks are compared only within connected opponent groups. Historical MVP provenance is kept in separate legacy revisions; unmapped votes are counted but excluded. No human humor improvement is claimed.
