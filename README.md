# At the Table

A food photo journal built in the same Next.js app used for Assignment #1. The home page reads photo records from Supabase and renders a responsive card gallery.

## Data design

PostgreSQL stores one row per photo in `public.food_photos`: its title, description, accessibility text, display order, and `storage_path`. Supabase Storage holds the JPEG bytes in a public `food-photos` bucket. The app fetches the rows through Supabase's Data API with a legacy anon key and builds image URLs from the stored paths. It does not bundle or hardcode the images in the page.

The table has row level security (RLS) enabled and only a public `SELECT` policy. Visitors cannot insert, change, or delete photo records. Public bucket downloads are intentional for a public gallery; uploads require separate authorization.

## Run locally

Use Node.js 20.9 or later and pnpm 11.19.0.

1. Copy `.env.example` to `.env.local` and replace both values with your Supabase project's URL and **legacy anon** key. `.env.local` is ignored by Git.
2. Run `pnpm install` and `pnpm dev`.
3. Open <http://localhost:3000>.

Run `pnpm lint` and `pnpm build` before deployment.

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
