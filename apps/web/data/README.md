# Historical seed fixtures

These small JSON snapshots belong to the earlier food gallery and caption-comparison exercises. `ai_captions.json` is also used by the deterministic legacy caption test. They are retained for reproducibility and the read-only archive.

The current co-writer reads its prepared catalog from Supabase; the initial sanitized image bytes are in `public/catalog/`. It does not use these JSON files as a live humor-training dataset. See [teaching-data preparation](../docs/co-writer.md#teaching-data-preparation) and the [catalog import report](../docs/catalog-import-report.json).

Do not put the raw course export, profiles, individual votes, credentials, or preparation caches in this folder.
