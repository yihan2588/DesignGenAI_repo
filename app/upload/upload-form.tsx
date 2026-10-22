"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { prepareUploadImage, validateUploadSource } from "@/lib/humor/upload-image";
import { uploadHumor } from "@/app/humor/actions";
import { startGeneration } from "@/app/humor/run-progress";
export function UploadForm() {
  const router=useRouter(); const key=useRef(""); const [preview,setPreview]=useState("");
  const [stage,setStage]=useState(""); const [error,setError]=useState(""); const [runId,setRunId]=useState("");
  useEffect(()=>()=>{if(preview) URL.revokeObjectURL(preview);},[preview]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(stage) return; setError("");
    const form=new FormData(event.currentTarget); if(!key.current) key.current=crypto.randomUUID(); form.set("request_key",key.current);
    const file = form.get("photo");
    if (!(file instanceof File)) { setError("Choose an image."); return; }
    const invalid = validateUploadSource(file);
    if (invalid) { setError(invalid); return; }
    setStage("Preparing your image…");
    try { form.set("photo", await prepareUploadImage(file)); setStage("Uploading your image…"); const result=await uploadHumor(form); if(!result.runId) throw new Error(result.error);
      setRunId(result.runId); setStage("Reading your image and writing captions…"); await startGeneration(result.runId); router.push(`/runs/${result.runId}`); router.refresh();
    } catch(e) { setError(e instanceof Error && !/Minified React|Server Components render|digest|Body exceeded/.test(e.message) ? e.message : "The upload was interrupted. Please refresh and try again with a smaller image."); setStage(""); }
  }
  return <form className="profile-form humor-upload" onSubmit={submit}>
    <label className="image-drop">Your image<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required disabled={Boolean(stage)||Boolean(runId)} onChange={e=>{const file=e.target.files?.[0];setError(file ? validateUploadSource(file) ?? "" : "");setPreview(file && !validateUploadSource(file)?URL.createObjectURL(file):"");key.current="";}} /><span className="fine-print">JPEG, PNG or WebP · up to 50 MB · large images are resized automatically</span></label>
    {preview&&<div className="upload-preview"><Image src={preview} alt="Your selected image preview" width={600} height={400} unoptimized /></div>}
    <p className="fine-print">Gemini will create a short title and describe what’s visible in your image, along with both captions. The description also becomes the image’s accessible text.</p>
    <label className="public-confirmation"><input name="public_ack" type="checkbox" required disabled={Boolean(stage)||Boolean(runId)} /><span>I can share this image publicly. It will be sent to Google Gemini, and the completed comparison will appear in the community gallery.</span></label>
    {error&&<p className="form-message" role="alert">{error}</p>}
    {runId&&!stage ? <Link className="primary-button" href={`/runs/${runId}`}>Open saved run and retry ↗</Link> : <button className="primary-button" disabled={Boolean(stage)}>{stage||"Generate two captions ↗"}</button>}
    <p className="fine-print" role="status">{stage ? "Keep this page open while we finish. Your saved run is also available in My runs." : "One image, two different approaches. You choose what lands."}</p>
  </form>;
}
