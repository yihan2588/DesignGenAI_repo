"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadHumor } from "@/app/humor/actions";
import { startGeneration } from "@/app/humor/run-progress";
export function UploadForm() {
  const router=useRouter(); const key=useRef(""); const [preview,setPreview]=useState("");
  const [stage,setStage]=useState(""); const [error,setError]=useState(""); const [runId,setRunId]=useState("");
  useEffect(()=>()=>{if(preview) URL.revokeObjectURL(preview);},[preview]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(stage) return; setError("");
    const form=new FormData(event.currentTarget); if(!key.current) key.current=crypto.randomUUID(); form.set("request_key",key.current);
    setStage("Uploading your image…");
    try { const result=await uploadHumor(form); if(!result.runId) throw new Error(result.error);
      setRunId(result.runId); setStage("Reading your image and writing captions…"); await startGeneration(result.runId); router.push(`/runs/${result.runId}`); router.refresh();
    } catch(e) { setError(e instanceof Error ? e.message : "The request was interrupted. Please try again."); setStage(""); }
  }
  return <form className="profile-form humor-upload" onSubmit={submit}>
    <label className="image-drop">Your image<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required disabled={Boolean(stage)||Boolean(runId)} onChange={e=>{const file=e.target.files?.[0];setPreview(file?URL.createObjectURL(file):"");key.current="";}} /><span className="fine-print">JPEG, PNG or WebP · up to 2 MB · still images only</span></label>
    {preview&&<div className="upload-preview"><Image src={preview} alt="Your selected image preview" width={600} height={400} unoptimized /></div>}
    <p className="fine-print">Gemini will create a short title and describe what’s visible in your image, along with both captions. The description also becomes the image’s accessible text.</p>
    <label className="public-confirmation"><input name="public_ack" type="checkbox" required disabled={Boolean(stage)||Boolean(runId)} /><span>I can share this image publicly. It will be sent to Google Gemini, and the completed comparison will appear in the community gallery.</span></label>
    {error&&<p className="form-message" role="alert">{error}</p>}
    {runId&&!stage ? <Link className="primary-button" href={`/runs/${runId}`}>Open saved run and retry ↗</Link> : <button className="primary-button" disabled={Boolean(stage)}>{stage||"Generate two captions ↗"}</button>}
    <p className="fine-print" role="status">{stage ? "Keep this page open while we finish. Your saved run is also available in My runs." : "One image, two different approaches. You choose what lands."}</p>
  </form>;
}
