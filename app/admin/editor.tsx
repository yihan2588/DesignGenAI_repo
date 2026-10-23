"use client";
import Link from "next/link";
import { promptLink } from "@/lib/arena-view";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "./actions";
export function Editor({
  action,
  children,
  label = "Save changes",
  initial = {},
}: {
  action: string;
  children?: React.ReactNode;
  label?: string;
  initial?: Record<string, unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [createdId, setCreatedId] = useState("");
  const router = useRouter();
  return (
    <form
      className="admin-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setMessage("");
        setCreatedId("");
        const data = {
          ...initial,
          ...Object.fromEntries(new FormData(e.currentTarget)),
        };
        try {
          const result = await mutate(action, data);
          setMessage(result.error ?? (action === "save_prompt" ? (initial.id ? "Configuration updated. The A/B selection is unchanged; new uploads use the saved settings." : "Configuration created. Select it in the live A/B test when ready.") : "Saved successfully."));
          if (result.ok && action === "save_prompt" && !initial.id && result.id) setCreatedId(result.id);
          if (result.ok) router.refresh();
        } catch {
          setMessage("The request failed. Please refresh and retry.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      <button disabled={busy}>{busy ? "Saving…" : label}</button>
      {message && <p role="status">{message}{createdId && <> <Link href={promptLink(createdId)}>View the new configuration →</Link></>}</p>}
    </form>
  );
}
