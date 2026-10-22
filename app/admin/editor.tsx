"use client";
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
  const router = useRouter();
  return (
    <form
      className="admin-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setMessage("");
        const data = {
          ...initial,
          ...Object.fromEntries(new FormData(e.currentTarget)),
        };
        try {
          const result = await mutate(action, data);
          setMessage(result.error ?? "Saved successfully.");
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
      {message && <p role="status">{message}</p>}
    </form>
  );
}
