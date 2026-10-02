# At the Table

A food photo journal built in the same Next.js app used for Assignment #1. The home page reads photo records from Supabase and renders a responsive card gallery.

## Data design

PostgreSQL stores one row per photo in `public.food_photos`: its title, description, accessibility text, display order, and `storage_path`. Supabase Storage holds the JPEG bytes in a public `food-photos` bucket. The app fetches the rows through Supabase's Data API with a legacy anon key and builds image URLs from the stored paths. It does not bundle or hardcode the images in the page.

The gallery table has row level security (RLS) enabled and read policies for visitors and signed-in users. Visitors cannot insert, change, or delete photo records. Public bucket downloads are intentional for a public gallery; uploads require separate authorization.

Week 3 adds Google sign-in, a profile editor, and `/members` (My table). Signed-out direct visits to `/profile` or `/members` redirect to `/login`. New accounts must fill in both names before viewing My table; the home page also prompts unfinished profiles.

`public.profiles.id` is both a primary key and a foreign key to `auth.users.id`. An AFTER INSERT trigger creates one profile per new account, with nullable names. Profile photos live in the private `avatars` Storage bucket, under the owner's UUID directory. Only an object path is stored in the profile; downloads use five-minute signed URLs.

## Run locally

Use Node.js 22.18 or later and pnpm 11.19.0 (the focused tests use Node's built-in TypeScript stripping).

1. Copy `.env.example` to `.env.local` and replace both values with your Supabase project's URL and **legacy anon** key. `.env.local` is ignored by Git.
2. Run `pnpm install` and `pnpm dev`.
3. Open <http://localhost:3000>.

Run `pnpm test`, `pnpm lint`, and `pnpm build` before deployment. Database behavior tests are in `supabase/tests/auth_profiles.sql`; run them through an administrative SQL connection. They use temporary test accounts and roll back all changes.

The app reads these variables only on the server. The anon key is still a public credential by design; RLS and table grants control access. Never substitute a service role or secret key.

## Database setup

Create a public Storage bucket named `food-photos` in the Supabase dashboard. Prepare copies of the 12 JPEGs from the course's `food_pic` folder, remove EXIF metadata, and name the copies `food-01.jpg` through `food-12.jpg` in the order recorded by [`data/food_photos.json`](data/food_photos.json). Upload those copies to the bucket. The file lists each card's metadata and storage path for reproducible seeding.

Create the metadata table with this SQL in the Supabase SQL editor:

```sql
create table public.food_photos (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) > 0),
  description text not null default '',
  alt_text text not null check (char_length(alt_text) > 0),
  storage_path text not null unique,
  sort_order integer not null unique check (sort_order > 0),
  created_at timestamptz not null default now()
);

alter table public.food_photos enable row level security;
revoke all on public.food_photos from anon, authenticated;
grant usage on schema public to anon;
grant select on public.food_photos to anon;

create policy "Public gallery read" on public.food_photos
  for select to anon using (true);
```

For new Supabase projects, a table created with SQL may not be automatically exposed to the Data API. The explicit `GRANT SELECT` above is required; verify exposure under Integrations → Data API if the REST query returns a permission error.

The deployed page queries `food_photos` with `order=sort_order.asc`. It shows a clear message if the database is unavailable and an empty state if no rows exist.

## Deploy

Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the Vercel project's Production environment. Push this repository to GitHub; the connected Vercel project should create a production deployment from `main`. In Settings → Deployment Protection, turn off Vercel Authentication for public access. Verify the new deployment's unique URL and image loading in an Incognito window before submission.

## Week 3 setup in the existing projects

1. Apply `supabase/migrations/20261002021930_food_gallery_auth.sql` once to the existing Homework 2 database. It creates profiles, private trigger functions, a backfill, grants/RLS, and the private avatar bucket/policies. It depends on the Homework 2 `food_photos` table. This repository contains the incremental migration, not a complete bootstrap of the preexisting database.
2. In Google Cloud, create a Web application OAuth client. Its authorized redirect URI is `https://<supabase-project-ref>.supabase.co/auth/v1/callback`. Google returns to Supabase first. Configure only basic sign-in scopes: openid, email, and profile.
3. Put the Google client ID and secret in Supabase → Authentication → Sign In / Providers → Google and enable the provider. Keep the secret out of Git and application/browser environment variables.
4. In Supabase → Authentication → URL Configuration, set the Site URL to the production app and add each allowed app URL ending in `/auth/callback`, including localhost and the exact deployment URL submitted for grading. The app starts OAuth using exactly that path, without a custom next query parameter. Provider response parameters such as code are expected.
5. Ensure the Google consent app audience permits the reviewer to sign in. Testing mode requires explicit test users; an external app using only basic identity scopes can be published when ready.

Auth runs on the server using `@supabase/ssr` and the existing environment variables, so no browser client or extra public environment variables are needed. `proxy.ts` refreshes session cookies; pages and actions validate identity independently. Auth responses are private and uncached. RLS stays on even though the assignment permits disabling it.

Photo updates accept JPEG/PNG/WebP up to 2 MiB and verify MIME signatures. Each upload uses a new random key, then conditionally updates the profile based on its previous `updated_at` value. Failed saves attempt to remove the new object; successful saves attempt to remove the old object. Cleanup is best effort: crashes or failed deletes can leave unused objects. A durable cleanup job and full image decoding/re-encoding are future hardening, not implemented guarantees. Account deletion is not exposed by this app.

Before submission verify: first Google signup creates a profile; missing names prompt onboarding; names save and persist; a photo uploads and remains visible after refresh; name/photo replacement works; My table renders only after login/onboarding; sign-out restores the public UI; a fresh Incognito visitor can view the public gallery but cannot view member/profile content. Course-portal submission is a separate action.
