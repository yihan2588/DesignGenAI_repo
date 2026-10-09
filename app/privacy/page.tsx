import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy — At the Table" };

export default function PrivacyPage() {
  return <div className="site-shell">
    <header className="site-header"><Link className="wordmark" href="/">at the table<span>.</span></Link><Link href="/">Back to gallery</Link></header>
    <main id="main-content" className="account-main privacy-main">
      <p className="eyebrow">AT THE TABLE / PRIVACY</p>
      <h1 className="account-title">Your data,<br /><em>explained.</em></h1>
      <p className="account-copy">At the Table is Yihan Wu&apos;s coursework food gallery. You can browse the public food collection without an account. Updated October 8, 2026.</p>
      <section><h2>AI descriptions and ratings</h2><p>When you generate a dish description, we send the public food photo and a fixed descriptive prompt to Google Gemini. We store the resulting two sentences, prompt, model name, account identifier, and timestamps in Supabase. Generated descriptions are public and remain saved when a newer version is created. They are visual guesses about ingredients, flavors, and cultural regions, not verified recipes or dietary advice. Google processes the image and prompt under its Gemini API terms; free-tier inputs may be used to improve Google products.</p><p>Your upvote or downvote is stored with your account and the specific description you rated. Other visitors cannot read your individual vote. You can change it by selecting the other rating.</p></section>
      <section><h2>Google sign-in</h2><p>Google supplies your account identifier, email address, and basic profile information, such as your name and Google profile picture, to Supabase Auth so this app can create and authenticate your account. We request only openid, email, and profile access. The app does not request Gmail or Drive access and does not receive your Google password.</p></section>
      <section><h2>Your app profile</h2><p>We store the first and last name you enter, your user identifier, timestamps, and a reference to your uploaded profile photo in Supabase. Photo files are stored separately in a private Supabase Storage bucket. They are not part of the public food gallery. The app displays your photo through a temporary link; someone who receives that link may view it while it remains valid. Project administrators have privileged access to stored account data.</p><p>Upload only images you want this app to store. Files may contain camera metadata. Replaced uploads may remain until cleanup completes.</p></section>
      <section><h2>Public gallery contributions</h2><p>When you use Share a photo and confirm publication, your food photo, title, caption, and image description become public. Anyone can view or download the image without signing in. We store its file separately in the public food-photos bucket and retain its object path, uploader identifier, text, and timestamps in PostgreSQL. The upload flow converts images to JPEG, resizes large images, and removes embedded camera metadata. Public images can be copied by others; removing the original cannot remove copies already downloaded.</p></section>
      <section><h2>Sessions and service providers</h2><p>Authentication cookies keep you signed in. Google provides sign-in, Supabase provides authentication, database and file storage, and Vercel hosts the app. These services process requests and may keep operational logs. This app uses Google user data for account authentication and profile display, not advertising or sale.</p></section>
      <section><h2>Editing and deletion</h2><p>You can edit your names and replace your photo in Profile. Signing out removes this browser&apos;s session; it does not delete stored account data. Account and photo deletion requests can be sent to Yihan Wu at <span>yihan2588@gmail.com</span>. The app does not currently provide a self-service account deletion button.</p></section>
    </main>
  </div>;
}
