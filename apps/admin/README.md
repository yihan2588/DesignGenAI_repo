# FunnyLLM Admin

**Operate the meme gallery and AI co-writer from one workspace.**

This is the companion operations app for [FunnyLLM](https://github.com/yihan2588/FunnyLLM). It brings moderation, retrieval assets, generation traces, and model controls into a task-based interface.

[Open the admin app](https://funnyllm-admin.vercel.app/admin) · [Try the public gallery](https://funnyllm.vercel.app) · [Operational contracts](docs/gallery-system.md)

![FunnyLLM admin overview with writing controls, request activity, and catalog readiness](docs/screenshots/admin-overview.jpg)

The dashboard shows operational state. Screenshot values are illustrative and are not adoption or reliability claims.

## Organized around the operator’s task

| Area | What an admin can do |
|---|---|
| **Overview** | Review failures, catalog readiness, reports, and draft compute latency; pause AI writing while saved drafts and exports remain usable. |
| **Content** | Inspect gallery media, feature posts, review reports, remove content, and restore it under explicit publication rules. |
| **Image library** | Upload sanitized images, edit descriptions and relationships, regenerate embeddings, and retire images from new retrieval. |
| **Activity** | Inspect request status, errors, results, model usage, and bounded prompt/response traces. |
| **Workflow** | Read the source-controlled co-writer steps; manage Gemini model entries and probe compatibility before activation. |
| **Examples** | Create, edit, and retire few-shot references; at most three active examples enter new drafts. |
| **People & access** | Read users and the exact admin allowlist. |

## Operational contracts

- **Authorization lives in the database.** A verified Google identity must match the exact admin allowlist on every admin read/write. User-editable profile fields cannot grant access. All Google accounts remain eligible for the user app.
- **Moderation controls media access.** Removal hides the post, resolves reports, and blocks owner republication. Restoring a user post leaves it unpublished until the owner explicitly republishes it.
- **Configuration is stable within a draft.** Models and active examples are frozen per draft. Retired images remain available to authorized saved drafts. A model selection probes the actual Interactions API and structured-output support before activation.
- **Traces have a clear boundary.** Private details may contain original input text; secrets and image bytes are excluded. Successful-draft compute p95 excludes upload, browser rendering, and final save. Usage events are not calibrated humor ratings.

There is **one co-writer workflow and one Gemini provider adapter**. Provider information is read-only. Signed-in users can open this app through **Account → Admin**; its server and database checks independently enforce access.

## Run and verify

Use Node.js 24 and the pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Configure the provisioned Supabase project and server credentials.
pnpm dev --webpack --port 3001
```

Both apps require the same `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, and matching `HUMOR_WRITER_KEY`. No service-role key is used. Follow the [shared setup guide](https://github.com/yihan2588/FunnyLLM/blob/main/apps/web/docs/setup.md), including the existing course-database prerequisite and OAuth callbacks. The allowlist is changed through a reviewed migration, not a profile toggle.

```sh
pnpm test
pnpm lint
pnpm build
```

Tests cover current operations, input validation, media sanitization, and safe authentication destinations. Shared SQL tests execute access, publication, revision and moderation rules. Live browser checks complement these contracts; humor quality requires separate human evaluation.

## Repository guide

| Path | Purpose |
|---|---|
| `app/` | Admin routes, forms, and server actions |
| `lib/` | Authorization, data access, library/media handling, and runtime validation |
| `supabase/migrations/` | Schema and access policies; use the canonical source in `apps/web/supabase` |
| `tests/` | Current admin operational, upload and authentication contracts |
| `docs/` | Operational contracts and setup |

[Documentation index](docs/README.md) · [User-app architecture and evaluation](https://github.com/yihan2588/FunnyLLM/blob/main/apps/web/docs/co-writer.md) · [Engineering study guide](https://github.com/yihan2588/FunnyLLM/tree/main/apps/web/docs/study-guide)
