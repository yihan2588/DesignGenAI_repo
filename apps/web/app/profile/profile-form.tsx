"use client";

import { useActionState } from "react";
import { prepareUploadImage } from "@/lib/upload-image";
import { saveProfile, type ProfileState } from "@/app/profile/actions";
import type { Profile } from "@/lib/auth";

export function ProfileForm({ profile, next }: { profile: Profile; next?: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(async (previous, data) => {
    const photo = data.get("photo");
    if (photo instanceof File && photo.size > 0) {
      try { data.set("photo", await prepareUploadImage(photo)); }
      catch (error) { return { error: error instanceof Error ? error.message : "This photo could not be prepared. Please choose another image." }; }
    }
    return saveProfile(previous, data);
  }, {});
  return <form action={action} className="profile-form">
    {next && <input type="hidden" name="next" value={next} />}
    <div className="name-fields">
      <label>First name<input name="first_name" autoComplete="given-name" defaultValue={profile.first_name ?? ""} maxLength={80} required disabled={pending} /></label>
      <label>Last name<input name="last_name" autoComplete="family-name" defaultValue={profile.last_name ?? ""} maxLength={80} required disabled={pending} /></label>
    </div>
    <label>Profile photo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="photo-help" disabled={pending} /></label>
    <p id="photo-help" className="fine-print">JPEG, PNG, or WebP, up to 50 MB. Large photos are automatically resized. Leave this empty to keep your current photo. Your photo is visible only to you.</p>
    {state.error && <p className="form-message" role="alert">{state.error}</p>}
    {state.success && <p className="success-message" role="status">{state.success}</p>}
    <button className="cw-primary" disabled={pending}>{pending ? "Preparing and saving…" : "Save profile"}</button>
  </form>;
}
