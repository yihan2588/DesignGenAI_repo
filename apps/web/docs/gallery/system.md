# Gallery, publication and operations

FunnyLLM opens on a public gallery. Funny Lab provides picture- and thought-based creation; My creations holds private drafts, shared posts, and saved memes.

## Private work and public snapshots

Generation saves a private revision. Publication requires an explicit choice of option, revision, and public alias. The database copies the image and caption into a public snapshot; subsequent private edits do not alter that post. A unique publication key prevents a retry from creating a duplicate.

Anonymous readers can browse and retrieve published media. Reactions, saves, remixes, and reports require sign-in. An image request must still satisfy the current publication or ownership rules; knowing an identifier alone is insufficient.

## Moderation

Owners can unpublish their posts. Admin removal hides a post and its public media, resolves reports, and blocks owner republication. Restoring a user post makes it unpublished: the owner must choose to publish it again. Downloaded copies cannot be recalled.

Gallery thumbnails use fixed image and caption areas. Images retain their aspect ratios with contain-fit; captions wrap and scale within the reserved area. Meme detail and PNG export use image-specific proportions.

## Generation state

Each request is claimed with an ID and input fingerprint. Duplicate IDs cannot create repeated work with changed inputs. A refinement commits only against the expected revision; a late response cannot overwrite a newer result. Failures preserve the last saved draft.

The model and active examples are saved when the draft begins. Admin changes affect new drafts. Real stage updates describe work in progress; complete options appear after validation. Upload, model execution, database persistence, and browser rendering are distinct parts of user-visible latency.

## Administration

| Workspace | Purpose |
|---|---|
| Overview | Failures, requests, content counts, catalog readiness and writing pause |
| Content | Gallery posts, reports, featuring, removal and restoration |
| Image library | Sanitized uploads, descriptions, relationships, indexing and retirement |
| Activity | Request status, stage timing, prompts, responses and results |
| Workflow | Source prompt definitions, provider status and model selection |
| Examples | Few-shot demonstrations used by new drafts |
| People & access | User list and exact administrator allowlist |

All Google accounts are eligible for the user app. Account → Admin opens the separate app. Admin reads and writes require verified identity and the exact allowlist at the server/database boundary. A visible link never grants access.

Model activation performs a small structured-output probe. This detects basic API incompatibility; it does not test the complete creative workflow or humor quality. Production smoke checks and controlled evaluation remain necessary.

## Testing and operational limits

Node tests exercise parsing, rendering, media sanitization, request handling and navigation. PGlite with pgvector executes SQL for ownership, publication, moderation, runtime configuration and revision contracts. Browser checks exercise navigation and the deployed flows. These checks establish behavior; human usefulness and humor need separate evaluation.

Private traces contain bounded input text, parsed responses, timing and usage. They omit secrets and image bytes, but can still contain sensitive user text. Successful-draft compute p95 excludes upload, browser rendering and final persistence. Read it alongside failures and end-to-end completion metrics.

Use the writing pause during provider incidents. Saved drafts, manual edits and exports remain useful. Automated retention, a complete fresh-database bootstrap and external tracing are future work.
