"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { uploadFoodPhoto } from "@/app/upload/actions";
import { GALLERY_IMAGE_TYPES, MAX_GALLERY_BYTES } from "@/lib/gallery-validation";

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadFoodPhoto, {});
  const [clientError, setClientError] = useState<string | null>(null);
  return <form action={action} className="profile-form upload-form" onSubmit={(event) => {
    const photo = new FormData(event.currentTarget).get("photo");
    if (!(photo instanceof File) || photo.size === 0 || photo.size > MAX_GALLERY_BYTES || !GALLERY_IMAGE_TYPES.includes(photo.type)) {
      event.preventDefault();
      setClientError("Choose a JPEG, PNG, or WebP photo up to 2 MB.");
    } else setClientError(null);
  }}>
    <label>Food photo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required aria-describedby="upload-photo-help" /></label>
    <p id="upload-photo-help" className="fine-print">Still JPEG, PNG, or WebP, up to 2 MB and 20 megapixels. We resize large photos and remove embedded camera metadata.</p>
    <label>Title<input name="title" maxLength={120} required placeholder="A meal worth remembering" /></label>
    <label>Caption (optional)<textarea name="description" maxLength={1000} rows={3} placeholder="The story behind your plate" /></label>
    <label>Image description<input name="alt_text" maxLength={300} required aria-describedby="alt-help" placeholder="A bowl of noodles with greens and red broth" /></label>
    <p id="alt-help" className="fine-print">Describe what is visible for people using a screen reader.</p>
    <label className="public-confirmation"><input name="publish_publicly" type="checkbox" required /> <span>I want to publish this photo and its text to the public gallery.</span></label>
    <p className="fine-print">Anyone can view or download published photos, including people without an account. Upload a photo you have permission to share. For removal, contact <a href="mailto:yihan2588@gmail.com">Yihan Wu</a>.</p>
    {(clientError || state.error) && <p className="form-message" role="alert">{clientError || state.error}</p>}
    {state.photoId && <p className="success-message" role="status">Your photo is now in the public gallery. <Link href={`/#photo-${state.photoId}`}>View your photo →</Link></p>}
    <button className="primary-button" disabled={pending}>{pending ? "Publishing…" : "Publish photo"}</button>
  </form>;
}
