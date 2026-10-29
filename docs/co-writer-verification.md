# Co-writer verification record — 29 October 2026

## Completed checks

- User app: 47 automated tests pass, including existing comparison behavior, image decoding, provider failures, co-writer contracts, workflow call budgets, exact SQL retrieval, owner isolation, writer-key enforcement, idempotency, revision conflicts, admin denial, pause behavior, upload admission and PNG rendering.
- Admin app: 45 existing tests pass. Both apps pass TypeScript and ESLint. Optimized Next.js builds include all new routes.
- Supabase: 887 catalog rows loaded. Verified 884 available rows, 885 compatible embeddings and 722 distinct sanitized media families. Operational guard migration applied. No new privileged test identity was created.
- Real signed-in browser, local app with live Supabase/Gemini: thought generation, a targeted refinement, image swap, saved-draft reload, private picture upload and three picture captions, manual wording save, undo, and actual PNG download all completed.
- One observed thought request used 3,611 ms of recorded generation work; the picture request used 5,165 ms. These are individual smoke observations, not production latency percentiles. Picture interpretation was 3,235 ms and composition 1,689 ms; remaining recorded time includes private image access.
- Final PNG uses Fontkit outlines from the bundled Chillax font. `browser-export.png` is an actual browser download. The export build traces include that font and exclude the large static catalog; production resolves catalog assets from its own deployment host.
- Hallmark responsive capture: 1280, 1440, 1920 and 375 px. Final sweep: zero FAIL and zero WARN, with one explicit waiver for the tall image-upload target. Fresh-context design review identified an undefined paper-texture token and generic headline; both were fixed and recaptured.
- Development evaluation: six fixtures, two systems per fixture, complete image-caption review sets and versioned raw results. See `evaluation/development-smoke`. No human ratings have been supplied.

## Limits and evidence boundaries

The automated checks establish contracts and access boundaries, not that a joke is funny. The smoke fixtures are authored development inputs, including two uses of one catalog image. No held-out human preference result or statistical improvement is claimed. The legacy production Prompt Lab configuration has not been compared in a frozen product-level trial; the new runner performs controlled direct-vs-interpreted and literal-vs-relational ablations.

Supabase security advisors report intentional deny-by-default private tables with RLS and no direct policies, plus a pre-existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Google sign-in behavior was retained. The warning is not a new co-writer migration defect.

Production deployment IDs and final route checks are appended after deployment verification. Local testing does not by itself establish production behavior.
