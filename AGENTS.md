# FunnyLLM monorepo

User app: apps/web. Admin: apps/admin. Run each app from its own directory. Both have independent lockfiles and Next.js instructions. Preserve authentication, URLs, runtime working directories and SQL history. apps/web/supabase is the canonical shared migration source; admin contains the historical copies used by its tests.
