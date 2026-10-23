import { snapshot } from "@/lib/admin";
import { METADATA_PROMPT } from "@/lib/humor/metadata";
import { MODELS } from "@/lib/humor/configured";
import { Editor } from "../editor";
import type { Revision } from "@/lib/admin-types";
function Fields({ p }: { p?: Revision }) {
  return (
    <>
      <label>
        Name
        <input
          name="name"
          maxLength={80}
          required
          defaultValue={p?.name ?? ""}
        />
      </label>
      <div className="form-row">
        <label>
          Gemini model
          <select name="model" defaultValue={p?.model ?? MODELS[0]}>
            {MODELS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          Temperature
          <input
            name="temperature"
            type="number"
            min="0"
            max="2"
            step="0.1"
            required
            defaultValue={p?.temperature ?? 1}
          />
        </label>
      </div>
      <p className="footnote">
        Gemini 3.6+ models ignore custom temperatures; use 3.1 Flash-Lite or 2.5
        for temperature experiments. Model access depends on the configured
        Gemini project.
      </p>
      <label>
        System prompt
        <textarea
          name="system_prompt"
          maxLength={12000}
          rows={3}
          defaultValue={p?.system_prompt ?? ""}
        />
      </label>
      <label>
        Caption prompt
        <textarea
          name="prompt"
          maxLength={12000}
          rows={12}
          required
          defaultValue={
            p?.prompt ?? "Write a funny, grounded caption for this image."
          }
        />
      </label>
      <p className="footnote">
        These two fields are the complete caption instructions sent to Gemini.
        Put any visual analysis, audience, topic, or candidate-selection directions here.
        Both candidates use the same generation path; no retrieval or hidden creative prompt is added.
        The app requires one JSON caption string and validates the 240-character limit.
        If captions are identical, candidate 2 is retried once with “Do not repeat this caption” and candidate 1’s text.
      </p>
    </>
  );
}
export default async function Prompts() {
  const d = await snapshot(),
    available = d.prompts.filter((p) => !p.archived);
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">PROMPT LAB</p>
          <h1>Find your funny.</h1>
          <p>Write, compare, learn. Every edit creates a new revision.</p>
        </div>
      </header>
      <section className="panel experiment">
        <h2>Live A/B test</h2>
        <p>
          Choose exactly two configurations. This applies to new generation
          claims; completed and in-flight pairs keep their original revisions.
          Candidate 1 and 2 are configuration slots, not the left and right voting
          positions: those are randomized and names are revealed after voting.
          Test new uploads in the <a href="https://design-gen-ai-repo.vercel.app/upload">current media app</a>;
          older commit-specific deployments keep their original generation code.
        </p>
        <Editor action="activate" label="Activate this pair">
          <div className="form-row">
            {["first_id", "second_id"].map((name, i) => (
              <label key={name}>
                Candidate {i + 1}
                <select
                  name={name}
                  defaultValue={i ? d.active.second_id : d.active.first_id}
                >
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </Editor>
      </section>
      <section className="panel">
        <h2>How requests are assembled</h2>
        <p>The system prompt and caption prompt below are sent as written, alongside the image.
          “Baseline” is the simple humor prompt; “HOMER-inspired” includes editable visual analysis
          and joke-selection instructions. You can rename or replace either configuration.</p>
        <details>
          <summary>Shared image metadata request</summary>
          <p>This separate request only supplies the image title and description.
            Its output is never passed to either caption candidate.</p>
          <p>{METADATA_PROMPT}</p>
          <p>Metadata model: gemini-3.1-flash-lite; temperature: 1; system prompt: empty.</p>
        </details>
      </section>
      <section className="panel">
        <h2>Create a configuration</h2>
        <Editor action="save_prompt" label="Create configuration">
          <Fields />
        </Editor>
      </section>
      <h2>
        Your configurations <span className="badge">{available.length}</span>
      </h2>
      <div className="prompt-grid">
        {available.map((p) => (
          <section className="panel" key={p.id}>
            <p className="eyebrow">
              {[d.active.first_id, d.active.second_id].includes(p.id)
                ? "● ACTIVE"
                : "○ AVAILABLE"}{" "}
              · {p.id.slice(0, 8)}
            </p>
            <h2>{p.name}</h2>
            <small>
              Created{" "}
              {new Date(p.created_at).toLocaleDateString("en-US", {
                timeZone: "America/New_York",
              })}
            </small>
            <details>
              <summary>Edit as a new revision</summary>
              <Editor
                action="save_prompt"
                initial={{ parent_id: p.id }}
                label="Save new revision"
              >
                <Fields p={p} />
              </Editor>
            </details>
            <details>
              <summary className="danger">Delete configuration</summary>
              <p>
                This removes it from selection. Historical votes retain their
                immutable revision. Active configurations must be replaced
                first.
              </p>
              <Editor
                action="delete_prompt"
                initial={{ id: p.id }}
                label="Delete from prompt library"
              />
            </details>
          </section>
        ))}
      </div>
    </>
  );
}
