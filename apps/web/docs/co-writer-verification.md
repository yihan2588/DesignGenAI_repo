# Co-writer verification record — 29 October 2026

This records the initial co-writer release. For the later gallery/admin remake, see [the current system release record](gallery/system.md).

## Completed checks

- User app: 47 automated tests pass, including existing comparison behavior, image decoding, provider failures, co-writer contracts, workflow call budgets, exact SQL retrieval, owner isolation, writer-key enforcement, idempotency, revision conflicts, admin denial, pause behavior, upload admission and PNG rendering.
- Admin app: 46 tests pass, including the co-writer sign-in return route. Both apps pass TypeScript and ESLint. Optimized Next.js builds include all new routes.
- Supabase: 887 catalog rows loaded. Verified 884 available rows, 885 compatible embeddings and 722 distinct sanitized media families. Operational guard migration applied. No new privileged test identity was created.
- Real signed-in browser, local app with live Supabase/Gemini: thought generation, a targeted refinement, image swap, saved-draft reload, private picture upload and three picture captions, manual wording save, undo, and actual PNG download all completed.
- Cancellation preserved all previous options. The signed-in result/editor view was also inspected at desktop and 375 px widths.
- One observed thought request used 3,611 ms of recorded generation work; the picture request used 5,165 ms. These are individual smoke observations, not production latency percentiles. Picture interpretation was 3,235 ms and composition 1,689 ms; remaining recorded time includes private image access.
- Final PNG uses Fontkit outlines from the bundled Chillax font. `browser-export.png` is an actual browser download. The export build traces include that font and exclude the large static catalog; production resolves catalog assets from its own deployment host.
- Hallmark responsive capture: 1280, 1440, 1920 and 375 px. Final sweep: zero FAIL and zero WARN, with one explicit waiver for the tall image-upload target. Fresh-context design review identified an undefined paper-texture token and generic headline; both were fixed and recaptured.
- Development evaluation: six fixtures, two systems per fixture, complete image-caption review sets and versioned raw results. See `evaluation/development-smoke`. No human ratings have been supplied.

## Limits and evidence boundaries

The automated checks establish contracts and access boundaries, not that a joke is funny. The smoke fixtures are authored development inputs, including two uses of one catalog image. No held-out human preference result or statistical improvement is claimed. The legacy production Prompt Lab configuration has not been compared in a frozen product-level trial; the new runner performs controlled direct-vs-interpreted and literal-vs-relational ablations.

Supabase security advisors report intentional deny-by-default private tables with RLS and no direct policies, plus a pre-existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Google sign-in behavior was retained. The warning is not a new co-writer migration defect.

The generated development review HTML was statically inspected. Its interactive browser check was not completed because the browser rejected local-file navigation; that restriction was not bypassed.

## Production release

Released on 29 October 2026 after staged production builds reached READY. Both repositories use the pushed `codex/funnyllm-cowriter` branch; production was explicitly promoted from the verified deployments. The branches have not been merged into their default branches.

| App | Production | Deployment | Deployed source |
| --- | --- | --- | --- |
| User | https://design-gen-ai-repo.vercel.app | `dpl_7sgFV6h7txEz4As5VCsmq2EhbgF1` | `c946297c9419c71602e16169437958212689f629` |
| Admin | https://humorllm-admin.vercel.app/admin/cowriter | `dpl_CjTC9BHLm92BgW4DrC8TaV3zc2r7` | `52d687c0ea674e418f30c508fa9817159c2b2558` |

Production verification:

- New homepage and preserved `/compare` return 200. Catalog JPGs return 200 with immutable caching. Private session/image routes reject unsigned requests with 401.
- A real signed-in production thought request returned three complete image-caption options. The admin trace recorded about 4.5 seconds of compute; this is one observation, not an SLO or percentile estimate.
- Downloading the selected option completed on production. `evaluation/production-export.png` is the actual browser download, visually checked for the correct image, caption, line wrapping and font. This exercises deployment-host asset access and the bundled export font in the deployed function.
- The signed-in production admin showed 887 catalog rows, 884 available media, 885 consistent vectors, 142 backfilled descriptions, enabled writing and request diagnostics. The failed cancellation test remains visible as a failed attempt rather than being hidden from diagnostics.
- The admin sign-in correction was verified on the staged production deployment: an unsigned visit to `/admin/cowriter` redirects to `/login?next=%2Fadmin%2Fcowriter`. The production alias promotion completed.

The initial staging builds exposed an overly broad `.vercelignore` rule that excluded `lib/supabase`. Root-scoped rules fixed it; the final upload manifests retain runtime Supabase code and exclude local credentials/cache. New Git previews do not inherit the user app's production-only credentials, so these release checks used production-target builds staged without automatic domain assignment.

Rollback candidates retained: user `dpl_HX1zkh3f6Wdj4DnRwdx8MAhBxT6q`; admin `dpl_Db5Fk5Du2sMwQwGzdFge5wqWE7qB`. The additive database migration can remain during an app rollback. The admin pause control is available for immediate containment without disabling manual edits or export.
