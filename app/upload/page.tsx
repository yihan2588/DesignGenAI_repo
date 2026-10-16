import { SiteHeader, SiteFooter } from "@/app/site-header";
import { requireCompleteProfile } from "@/lib/auth";
import { UploadForm } from "@/app/upload/upload-form";
export const metadata = { title: "Upload an image — HumorLLM" };
export default async function UploadPage() {
  await requireCompleteProfile();
  return <div className="site-shell humor-shell"><SiteHeader /><main id="main-content" className="account-main"><p className="eyebrow">GIVE US SOMETHING TO WORK WITH</p><h1 className="account-title">Your image.<br /><em>Two takes.</em></h1><p className="account-copy">An expressive face, an odd situation, a perfectly ordinary Tuesday. Let’s see what the captions make of it.</p><section className="account-card" aria-label="Create a caption comparison"><UploadForm /></section></main><SiteFooter /></div>;
}
