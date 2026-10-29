# FunnyLLM documentation

- [Product and architecture overview](../README.md)
- [Setup and deployment](setup.md)
- [Workflow, retrieval, data preparation and tradeoffs](co-writer.md)
- [Publication, moderation and operations](gallery/system.md)
- [Visual engineering and interview guide](study-guide/README.md)
- [Admin application](../../admin/README.md)

## Evaluate the product

[Evaluation protocol](co-writer.md#evaluation-protocol) explains how to compare retrieval representations and the interpretation step without changing multiple causes at once. [Task fixtures](evaluation/tasks.json) are development inputs, not a held-out human benchmark. Run the harness to produce a fresh blinded review and analyze task-level outcomes.

[Catalog preparation report](catalog-import-report.json) records media availability and representation coverage. These are data-engineering counts, not measures of humor or adoption. API credentials and raw source exports remain outside the repository.
