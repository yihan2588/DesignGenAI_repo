# Documentation

## Start here

- [Product overview and screenshots](../README.md)
- [Local setup and deployment boundaries](setup.md)
- [Engineering study guide](study-guide/README.md): offline HTML with worked diagrams, interactive examples, and interview practice

## Current system

- [Implementation and decisions](co-writer.md): workflow, retrieval, data preparation, contracts, tradeoffs, and evaluation
- [Gallery and operations release](gallery/system.md): publication, moderation, access, migrations, and deployed-flow verification
- [Initial catalog import report](catalog-import-report.json): counts, provenance, and media failures
- [Companion admin repository](https://github.com/yihan2588/FunnyLLM/tree/main/apps/admin)

## Evaluation material

- [Evaluation protocol and commands](co-writer.md#evaluation-protocol)
- [Development task fixtures](evaluation/tasks.json)
- [Blinded development review](evaluation/development-smoke/review.html): open the downloaded HTML locally; keep its images alongside it
- [Recorded smoke outputs](evaluation/development-smoke/results.json)

These six fixtures are development cases, not a held-out human preference result. `blind-key.json` is an unblinding artifact: do not inspect it before completing a review. Example PNG exports and screenshots are verification artifacts, not benchmark claims.

## Historical records

Preserved for provenance; these do not describe the current main product:

- [Initial co-writer verification](co-writer-verification.md)
- [Legacy comparison system](legacy-comparison.md)
- [Earlier prompt experiments](admin-experiments.md)
- [Early gallery history](at-the-table-history.md)
- [Original personal-page plan](superpowers/plans/2026-09-18-personal-page.md)

Applied SQL history and old data snapshots remain in place because they are referenced by migrations and the read-only archive. The source-controlled workflow is the current generation definition; earlier plans are not runtime configuration.
