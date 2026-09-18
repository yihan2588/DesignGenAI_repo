"use client";

import { useState } from "react";

const emails = [
  { label: "UNIVERSITY", address: "yw4756@columbia.edu" },
  { label: "PERSONAL", address: "yihan2588@gmail.com" },
];

export default function Contact() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  async function copyEmail(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setMessage(`Copied ${address}`);
    } catch {
      setMessage("Copy wasn’t available. Select the email text and copy it manually.");
    }
  }

  return (
    <>
      <button className="button secondary" type="button" aria-expanded={open} aria-controls="contact-panel" onClick={() => { setOpen(!open); setMessage(""); }}>
        Contact me <span className={`plus ${open ? "is-open" : ""}`} aria-hidden="true">+</span>
      </button>
      <section className="contact-panel" id="contact-panel" aria-labelledby="contact-heading" hidden={!open}>
        <div className="contact-heading">
          <h2 id="contact-heading">Let’s connect.</h2>
          <a href="https://www.linkedin.com/in/yihan-wu-205864263/" target="_blank" rel="noopener noreferrer">LinkedIn <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>
        </div>
        <p className="contact-hint">Find me on LinkedIn, or copy an email below.</p>
        <div className="email-list">
          {emails.map(({ label, address }) => (
            <div className="email-row" key={address}>
              <div><span className="email-label">{label}</span><span className="email-address">{address}</span></div>
              <button className="copy-button" type="button" aria-label={`Copy ${address}`} onClick={() => void copyEmail(address)}>Copy</button>
            </div>
          ))}
        </div>
        <p className="copy-status" role="status" aria-live="polite">{message}</p>
      </section>
    </>
  );
}
