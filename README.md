# FunnyLLM

A two-mode meme co-writer built with Next.js, Gemini and Supabase.

- **I have a pic:** upload a private image, optionally describe its funny spirit, and get three short captioned takes.
- **I have a thought:** describe a target or situation and get three complete image–caption options from a trusted teaching catalog.
- Refine one take, edit wording, undo, swap a retrieved image, and export a PNG.

The previous blind comparison product remains at `/compare`. Existing votes and admin prompt configurations are retained.

Production: https://design-gen-ai-repo.vercel.app
Admin: https://humorllm-admin.vercel.app/admin/cowriter

## Run locally

Use Node 24 and pnpm. Copy `.env.example` to ignored `.env.local`, then configure the existing server-only `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY` and `HUMOR_WRITER_KEY`.

```sh
pnpm install --frozen-lockfile
pnpm dev --webpack
pnpm test
pnpm lint
pnpm build
```

The webpack flag also supports this workspace’s shared dependency symlink. No new API key or service-role key is required. The migrations build on the existing course database; see the release mapping before applying to an existing project.

## Engineering evidence

- [Implementation, decisions, data preparation and evaluation protocol](docs/co-writer.md)
- [Verification and release record](docs/co-writer-verification.md)
- [Catalog preparation report](docs/catalog-import-report.json)
- [Development blind review](docs/evaluation/development-smoke/review.html)
- [Legacy comparison documentation](docs/legacy-comparison.md)

Run `pnpm eval:cowriter` after preparing the catalog to create a fresh blinded review. Automated completion checks and example captions do not establish a human humor improvement. No automatic prompt evolution or promotion is enabled.
