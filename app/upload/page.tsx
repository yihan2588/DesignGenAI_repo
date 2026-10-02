import { SiteHeader } from "@/app/site-header";
import { requireCompleteProfile } from "@/lib/auth";
import { UploadForm } from "@/app/upload/upload-form";

export const metadata = { title: "Share a photo — At the Table" };

export default async function UploadPage() {
  await requireCompleteProfile();
  return <div className="site-shell"><SiteHeader /><main id="main-content" className="account-main">
    <p className="eyebrow">THE COLLECTION / YOUR CONTRIBUTION</p>
    <h1 className="account-title">Share a plate,<br /><em>tell its story.</em></h1>
    <p className="account-copy">Add a food photo to our shared collection. Your photo, title, and caption will be visible to everyone.</p>
    <section className="account-card" aria-label="Publish a food photo"><UploadForm /></section>
  </main></div>;
}
