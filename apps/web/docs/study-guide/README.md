# FunnyLLM engineering and interview guide

An offline visual guide to the **gallery + Funny Lab** product: creative objectives, retrieval, reliable editing, publication, access control, operations, and evaluation.

## Open and study

Open `apps/web/docs/study-guide/index.html` in a browser after cloning the repository. Keep `index.html`, `guide.js`, `guide.css`, `base.css`, and `tokens.css` together. GitHub’s file viewer shows source rather than running the guide.

The guide needs no API key, external fonts, or network access. You can also run `python3 -m http.server 8000` from this directory and open `http://localhost:8000`.

Start with the cat-on-a-laptop example, then follow the eight chapters or jump directly to a mechanism:

- Trace picture and thought inputs through two generation calls.
- Explore intent fit, retrieval strategies, rank fusion, and latency tradeoffs.
- Follow a draft through publication, editing, removal, and restoration.
- Explain image-ID schemas, revision conflicts, and the separate admin boundary.
- Rehearse a 60-second pitch, a portfolio demo, and ten interview drills with separate hints and answers.

The neutral reading theme is designed for technical study. Worked calculations are illustrative, not production benchmarks. Main explanations and static examples remain readable without JavaScript. Human humor improvement remains unmeasured; the guide teaches how to evaluate it.

[Implementation](../co-writer.md) · [Publication and operations](../gallery/system.md) · [Project README](../../../../README.md)
