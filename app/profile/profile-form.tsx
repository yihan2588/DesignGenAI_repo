"use client";

import { useActionState } from "react";
import { saveProfile } from "@/app/profile/actions";
import type { Profile } from "@/lib/auth";

export function ProfileForm({ profile, next }: { profile: Profile; next?: string }) {
  const [state, action, pending] = useActionState(saveProfile, {});
  return <form action={action} className="profile-form">
    {next && <input type="hidden" name="next" value={next} />}
    <div className="name-fields">
      <label>First name<input name="first_name" autoComplete="given-name" defaultValue={profile.first_name ?? ""} maxLength={80} required /></label>
      <label>Last name<input name="last_name" autoComplete="family-name" defaultValue={profile.last_name ?? ""} maxLength={80} required /></label>
    </div>
    <label>Profile photo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="photo-help" /></label>
    <p id="photo-help" className="fine-print">JPEG, PNG, or WebP, up to 2 MB. Leave this empty to keep your current photo. Your photo is visible only to you.</p>
    {state.error && <p className="form-message" role="alert">{state.error}</p>}
    {state.success && <p className="success-message" role="status">{state.success}</p>}
    <button className="primary-button" disabled={pending}>{pending ? "Saving…" : "Save profile"}</button>
  </form>;
}
