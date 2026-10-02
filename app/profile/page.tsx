import Image from "next/image";
import Link from "next/link";
import { requireUser, getProfile } from "@/lib/auth";
import { isProfileComplete } from "@/lib/profile-validation";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/app/site-header";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: avatar } = profile.avatar_path
    ? await supabase.storage.from("avatars").createSignedUrl(profile.avatar_path, 300)
    : { data: null };
  return <div className="site-shell"><SiteHeader /><main id="main-content" className="account-main">
    <p className="eyebrow">YOUR CORNER / PROFILE</p>
    <h1 className="account-title">Make yourself<br /><em>at home.</em></h1>
    <p className="account-copy">{isProfileComplete(profile) ? "A few details that make this space yours. Update them whenever you like." : "Welcome! Add your first and last name to finish setting up your profile."}</p>
    {error === "signout" && <p className="form-message" role="alert">Sign-out failed. Please try again.</p>}
    <section className="account-card" aria-label="Edit your profile">
      <div className="profile-summary">
        {avatar ? <Image src={avatar.signedUrl} alt="Your profile photo" width={88} height={88} className="avatar" unoptimized /> : <span className="avatar avatar-placeholder" aria-label="No profile photo">{profile.first_name?.slice(0, 1).toUpperCase() || "?"}</span>}
        <div><h2>Your profile</h2><p className="account-email">{user.email}</p></div>
      </div>
      <ProfileForm profile={profile} />
    </section>
    {isProfileComplete(profile) && <Link className="member-link" href="/members">Visit my table →</Link>}
  </main></div>;
}
