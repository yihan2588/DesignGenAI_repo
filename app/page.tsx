import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/app/site-header";
import { getUser, getProfile } from "@/lib/auth";
import { isProfileComplete } from "@/lib/profile-validation";

export const dynamic = "force-dynamic";

type FoodPhoto = {
  id: number;
  title: string;
  description: string;
  alt_text: string;
  storage_path: string;
  sort_order: number;
};

async function getFoodPhotos(): Promise<{ photos: FoodPhoto[]; error: boolean }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error("Supabase environment variables are missing.");
    return { photos: [], error: true };
  }

  try {
    const url = new URL("/rest/v1/food_photos", supabaseUrl);
    url.searchParams.set("select", "id,title,description,alt_text,storage_path,sort_order");
    url.searchParams.set("order", "sort_order.asc");

    const response = await fetch(url, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`Supabase photo query failed: ${response.status}`);
      return { photos: [], error: true };
    }

    return { photos: (await response.json()) as FoodPhoto[], error: false };
  } catch (error) {
    console.error("Supabase photo query failed:", error);
    return { photos: [], error: true };
  }
}

function photoUrl(storagePath: string): string {
  const base = process.env.SUPABASE_URL;
  if (!base) return "";
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/food-photos/${encodedPath}`;
}

export default async function Home() {
  const [{ photos, error }, user] = await Promise.all([getFoodPhotos(), getUser()]);
  const profile = user ? await getProfile(user.id) : null;

  return (
    <div className="site-shell">
      <SiteHeader />

      <main id="main-content">
        {profile && !isProfileComplete(profile) && <aside className="onboarding-banner">Welcome! Add your first and last name to finish your profile. <Link href="/profile">Complete profile →</Link></aside>}
        <section className="hero" aria-labelledby="page-title">
          <p className="eyebrow">THE COLLECTION / 01</p>
          <h1 id="page-title">Good food,<br /><em>good memories.</em></h1>
          <p className="hero-copy">A little visual diary of plates worth remembering, from home cooking to meals shared out.</p>
          <div className="hero-rule"><span>{photos.length.toString().padStart(2, "0")} PHOTOS</span><span>SCROLL TO EXPLORE ↓</span></div>
        </section>

        <section className="gallery" aria-label="Food photo gallery">
          {error ? (
            <p className="gallery-message" role="alert">The photo collection is temporarily unavailable. Please try again in a moment.</p>
          ) : photos.length === 0 ? (
            <p className="gallery-message">The collection is empty for now. Check back soon.</p>
          ) : (
            <ol className="photo-grid">
              {photos.map((photo, index) => (
                <li className="photo-card" key={photo.id}>
                  <div className="photo-frame">
                    <Image
                      src={photoUrl(photo.storage_path)}
                      alt={photo.alt_text}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 980px) 50vw, 33vw"
                      priority={index === 0}
                      className="food-image"
                    />
                    <span className="photo-number">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="photo-caption">
                    <h2>{photo.title}</h2>
                    <p>{photo.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
        <aside className="member-invite" aria-label="Member space">
          <div><p className="eyebrow">{user ? "YOUR SEAT IS WAITING" : "MAKE YOURSELF AT HOME"}</p><h2>{user ? "A table of your own." : "There is a seat for you."}</h2><p>{user ? "Visit your member space and keep your profile up to date." : "Sign in to create your profile and step into your member space."}</p></div>
          <Link className="primary-button" href={user ? "/members" : "/login"}>{user ? "Visit my table" : "Join the table"} →</Link>
        </aside>
      </main>

      <footer className="site-footer"><span>AT THE TABLE © {new Date().getFullYear()}</span><span>MADE WITH APPETITE IN NEW YORK</span></footer>
    </div>
  );
}
