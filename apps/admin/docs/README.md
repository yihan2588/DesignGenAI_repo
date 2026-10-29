# Admin documentation

## Current system

- [Product overview and screenshot](../README.md)
- [Gallery and co-writer operations](gallery-system.md): access contracts, moderation, library/model/example management, migration mapping, and release verification
- [Shared local setup](https://github.com/yihan2588/FunnyLLM/blob/main/apps/web/docs/setup.md)
- [User-app architecture, retrieval, and evaluation](https://github.com/yihan2588/FunnyLLM/blob/main/apps/web/docs/co-writer.md)
- [Visual engineering study guide](https://github.com/yihan2588/FunnyLLM/tree/main/apps/web/docs/study-guide)

The canonical shared migration source is `apps/web/supabase`. Matching historical copies remain here for reproducibility. SQL regression tests run from `apps/web/tests`; the admin test suite covers current operations only. Do not apply a second copy or replay local timestamps against already-applied live migrations.

## Historical records

These explain earlier iterations and verification; the root README and current system record describe the shipped product.

- [Initial admin/co-writer verification](admin-verification.md)
- [22 October QA](qa-2026-10-22.md)
- [23 October QA](qa-2026-10-23.md)
- [Early project history](at-the-table-history.md)
- [Original personal-page plan](superpowers/plans/2026-09-18-personal-page.md)

Legacy experiments and old data remain as provenance. Runtime secrets, local build output, and visual-review caches stay out of Git.
