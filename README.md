# HumorLLM Control Room

Separate admin app based on the user-approved pre-RAG media app at `13edf43`.

Google OAuth and a fresh database `profiles.is_superadmin` check guard the app, every Server Action, and all admin RPCs. No service-role key is used. Bootstrap an existing verified operator profile through trusted database access; ordinary column-scoped profile updates cannot change the role.

## Features

- Overview: revision-level Bradley–Terry rankings, raw win-rate Wilson intervals, matchup counts and audience activity.
- Media: create via upload and the real caption generator, read complete pairs, update image title/description, confirm deletion of an entire entry and its pairs/votes.
- Prompt lab: create, revise and delete configurations; atomically select two different active revisions. Deletion retires configurations while preserving provenance. In-flight pairs retain revisions captured at claim time.
- Read-only profiles and vote ledger, 50 rows per page.

## Local verification

`pnpm test`, `pnpm lint`, `pnpm build`. Tests include isolated PostgreSQL with minimal Auth/Storage fixtures. This serializes connections and does not prove real concurrent contention. Browser and hosted verification are recorded separately in `docs/admin-verification.md`.

## Generation contract

No RAG or worker service. Both candidates run through the original Gemini Interactions transport. A fixed, neutral visual metadata/plan stage precedes configurable direct or plan/candidate generation. Prompt, system prompt, model and temperature belong to each immutable revision. Gemini 3.6+ ignores custom temperature; the UI explains this. JSON, grounding, safety and caption length remain enforced. Four calls and a 90-second application deadline bound each generation attempt.

Historical `humor-mvp-3` pairs with matching model provenance have separate read-only legacy revisions. Unmapped votes are counted but excluded from rankings. Rankings reflect preferences in this sample, not independent human humor quality. Cross-component rankings and repeated-image/voter dependence require caution.

## Deployment

Use the same Supabase project as the media app and configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, `HUMOR_WRITER_KEY` as server environment variables. Allow exact admin OAuth callbacks in Supabase. Vercel deployment protection is disabled; application authorization remains mandatory. Never publish `.env*`, `.vercel`, session files or private user data.


Prompt configuration correction (2026-10-22): the configured generator uses a single caption request per revision. The editable system prompt and caption prompt are sent verbatim with the image. There is no engine selector, injected visual plan, or audience instruction. The shared neutral metadata request never feeds caption generation; its full text is displayed in Prompt Lab. JSON response validation and a single disclosed duplicate-avoidance retry remain fixed. New Baseline and HOMER-inspired revisions replace the untouched starter pair; old revisions and votes remain intact. Use the current configured media deployment, not a frozen humor-mvp-3 URL, when testing admin prompt changes.
