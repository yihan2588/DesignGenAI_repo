import Image from "next/image";
import Link from "next/link";
import { requireUser, getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader, SiteFooter } from "@/app/site-header";
import { ProfileForm } from "./profile-form";
import { safeReturn } from "@/lib/humor/schemas";
export const dynamic = "force-dynamic";
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const user = await requireUser("/profile"), profile = await getProfile(user.id), { error, next } = await searchParams, supabase = await createClient();
  const { data: avatar } = profile.avatar_path ? await supabase.storage.from("avatars").createSignedUrl(profile.avatar_path,300) : { data: null };
  return <div className="cw-app"><SiteHeader/><main id="main-content" className="funny-account-page"><h1>Your profile</h1><p>These details stay private. Choose a public alias each time you share.</p>{error === "signout" && <p className="funny-inline-error" role="alert">Sign-out failed. Please try again.</p>}<section className="funny-account-panel" aria-label="Edit your profile"><div className="funny-profile-summary">{avatar ? <Image src={avatar.signedUrl} alt="Your profile photo" width={72} height={72} className="funny-avatar" unoptimized/> : <span className="funny-avatar" aria-label="No profile photo">{profile.first_name?.slice(0,1).toUpperCase() || "?"}</span>}<p>{user.email}</p></div><ProfileForm profile={profile} next={next ? safeReturn(next) : undefined}/></section><Link className="cw-link" href="/creations">Back to my creations</Link></main><SiteFooter/></div>;
}
