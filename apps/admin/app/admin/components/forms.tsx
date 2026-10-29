"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { operate, saveLibrary } from "../operations";
import type { LibraryImage } from "@/lib/funny/types";
export function OperationForm({ action, id, label = "Save changes", children, className = "", success }: { action: string; id?: string; label?: string; children?: React.ReactNode; className?: string; success?: string }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
  const router = useRouter();
  return <form className={`operation-form ${className}`} onSubmit={async event => {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget); form.set("action", action); if (id) form.set("id", id);
    setBusy(true); setMessage("");
    try { const result = await operate(form); setFailed(!result.ok); setMessage(result.error || success || result.message || "Saved."); if (result.ok) router.refresh(); }
    catch { setFailed(true); setMessage("The request could not finish. Please try again."); }
    finally { setBusy(false); }
  }}><fieldset disabled={busy}>{children}<button className="button" type="submit">{busy ? "Saving…" : label}</button></fieldset>{message && <p className={failed ? "form-message error-message" : "form-message"} role={failed ? "alert" : "status"}>{message}</p>}</form>;
}
export function Confirmation({ children }: { children: React.ReactNode }) { return <label className="check"><input type="checkbox" name="confirm" required />{children}</label>; }
export function LibraryForm({ image }: { image?: LibraryImage }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
  const router = useRouter();
  return <form className="operation-form" onSubmit={async event => {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget); if (image) data.set("id", image.id);
    setBusy(true); setMessage("Saving the image and its search index…"); setFailed(false);
    try { const result = await saveLibrary(data); setFailed(!result.ok); setMessage(result.error || result.message || "Saved."); if (result.ok) { router.refresh(); if (!image && result.id) router.push(`/admin/library?id=${result.id}`); } }
    catch { setFailed(true); setMessage("The image could not be saved. Check that it is under 2 MB and try again."); }
    finally { setBusy(false); }
  }}><fieldset disabled={busy}>{!image && <label>Image<input name="photo" type="file" required accept="image/jpeg,image/png,image/webp" /><small>A still JPEG, PNG or WebP, up to 2 MB and 20 megapixels.</small></label>}<label>Image description<textarea name="description" defaultValue={image?.description} required minLength={3} maxLength={4000} rows={4} /><small>Describe what is visible. Supplied teaching descriptions remain trusted.</small></label><label>Comic relationships<textarea name="affordances" defaultValue={image?.affordances} maxLength={2000} rows={3} /><small>Optional interpretations: avoidance, misplaced confidence, unequal effort.</small></label><label className="check"><input name="available" type="checkbox" defaultChecked={image?.available ?? true} />Available to Funny Lab</label><button className="button primary" disabled={busy}>{busy ? "Indexing…" : image ? "Save and re-index" : "Upload and index"}</button></fieldset>{message && <p className={failed ? "form-message error-message" : "form-message"} role={failed ? "alert" : "status"}>{message}</p>}</form>;
}
